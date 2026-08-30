/**
 * Integration tests — appointment scheduling workflows.
 *
 * Exercises the real appointments controller against an in-memory MongoDB:
 *   - create / list / get / update / cancel appointments via the API
 *   - authentication enforcement
 *   - doctor conflict detection (two appointments must not overlap)
 */
process.env.MONGO_URI = 'mongodb://localhost:27017/test';
process.env.JWT_ACCESS_TOKEN_SECRET = 'test-access-secret-32-chars-long!!';
process.env.JWT_REFRESH_TOKEN_SECRET = 'test-refresh-secret-32-chars-long!';
process.env.API_PORT = '3001';
process.env.NODE_ENV = 'test';

jest.mock('@health-watchers/config', () => ({
  config: {
    jwt: {
      accessTokenSecret: 'test-access-secret-32-chars-long!!',
      refreshTokenSecret: 'test-refresh-secret-32-chars-long!',
      issuer: 'health-watchers-api',
      audience: 'health-watchers-client',
    },
    apiPort: '3001',
    nodeEnv: 'test',
    mongoUri: '',
  },
}));

jest.mock('@api/utils/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

jest.mock('@api/realtime/socket', () => ({
  emitToClinic: jest.fn(),
  emitToUser: jest.fn(),
}));

// The scheduling service is mocked so availability checks pass without
// pre-seeding schedules.
jest.mock('@api/modules/schedules/schedules.service', () => ({
  isStaffAvailable: jest.fn().mockResolvedValue(true),
}));

import express from 'express';
import request from 'supertest';
import mongoose from 'mongoose';
import { appointmentRoutes } from '../modules/appointments/appointments.controller';
import { AppointmentModel } from '../modules/appointments/appointment.model';
import { startTestDb, stopTestDb, clearDb, TestDb } from './helpers/test-db';
import {
  createClinicWithAdmin,
  createPatient,
  createUser,
  makeAccessToken,
} from './helpers/factories';

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/v1/appointments', appointmentRoutes);
  return app;
}

async function setup() {
  const { clinic, admin } = await createClinicWithAdmin();
  const doctor = await createUser({ clinicId: clinic._id, role: 'DOCTOR' });
  const token = makeAccessToken({
    userId: admin._id.toString(),
    role: 'CLINIC_ADMIN',
    clinicId: clinic._id.toString(),
  });
  const patient = await createPatient({ clinicId: clinic._id });
  return { clinic, admin, doctor, token, patient };
}

const tomorrow = () => new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

describe('appointment scheduling integration flows', () => {
  let testDb: TestDb;
  let app: express.Express;

  beforeAll(async () => {
    testDb = await startTestDb();
    app = buildApp();
  });

  afterEach(async () => {
    await clearDb();
  });

  afterAll(async () => {
    await stopTestDb(testDb);
  });

  describe('POST /api/v1/appointments', () => {
    it('creates an appointment for a patient and doctor', async () => {
      const { token, patient, doctor } = await setup();

      const res = await request(app)
        .post('/api/v1/appointments')
        .set('Authorization', `Bearer ${token}`)
        .send({
          patientId: patient._id.toString(),
          doctorId: doctor._id.toString(),
          scheduledAt: tomorrow(),
          duration: 30,
          type: 'consultation',
          chiefComplaint: 'Routine checkup',
        });

      expect(res.status).toBe(201);
      expect(res.body.status).toBe('success');
      expect(res.body.data.patientId).toBe(patient._id.toString());

      const doc = await AppointmentModel.findById(res.body.data.id);
      expect(doc).not.toBeNull();
      expect(doc!.status).toBe('scheduled');
    });

    it('requires authentication', async () => {
      const { patient, doctor } = await setup();
      const res = await request(app).post('/api/v1/appointments').send({
        patientId: patient._id.toString(),
        doctorId: doctor._id.toString(),
        scheduledAt: tomorrow(),
        type: 'consultation',
      });
      expect(res.status).toBe(401);
    });

    it('returns 400 for an invalid body', async () => {
      const { token, patient, doctor } = await setup();
      const res = await request(app)
        .post('/api/v1/appointments')
        .set('Authorization', `Bearer ${token}`)
        .send({ patientId: patient._id.toString(), doctorId: doctor._id.toString() });
      expect(res.status).toBe(400);
    });
  });

  describe('conflict detection', () => {
    it('rejects overlapping appointments for the same doctor', async () => {
      const { token, patient, doctor } = await setup();
      const scheduledAt = tomorrow();
      const body = {
        patientId: patient._id.toString(),
        doctorId: doctor._id.toString(),
        scheduledAt,
        duration: 30,
        type: 'consultation',
      };

      const first = await request(app)
        .post('/api/v1/appointments')
        .set('Authorization', `Bearer ${token}`)
        .send(body);
      expect(first.status).toBe(201);

      const overlapping = await request(app)
        .post('/api/v1/appointments')
        .set('Authorization', `Bearer ${token}`)
        .send(body);
      expect(overlapping.status).toBe(409);
    });
  });

  describe('GET /api/v1/appointments', () => {
    it('lists appointments', async () => {
      const { token, patient, doctor } = await setup();
      await AppointmentModel.create({
        patientId: patient._id,
        doctorId: doctor._id,
        clinicId: patient.clinicId,
        scheduledAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        duration: 30,
        type: 'consultation',
      });

      const res = await request(app)
        .get('/api/v1/appointments')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeGreaterThan(0);
    });
  });

  describe('GET /api/v1/appointments/:id', () => {
    it('returns the appointment by id', async () => {
      const { token, patient, doctor } = await setup();
      const appointment = await AppointmentModel.create({
        patientId: patient._id,
        doctorId: doctor._id,
        clinicId: patient.clinicId,
        scheduledAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        duration: 30,
        type: 'consultation',
      });

      const res = await request(app)
        .get(`/api/v1/appointments/${appointment._id}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe(appointment._id.toString());
    });
  });

  describe('PUT /api/v1/appointments/:id', () => {
    it('updates the appointment status', async () => {
      const { token, patient, doctor } = await setup();
      const appointment = await AppointmentModel.create({
        patientId: patient._id,
        doctorId: doctor._id,
        clinicId: patient.clinicId,
        scheduledAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        duration: 30,
        type: 'consultation',
      });

      const res = await request(app)
        .put(`/api/v1/appointments/${appointment._id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ status: 'confirmed' });

      expect(res.status).toBe(200);
      const updated = await AppointmentModel.findById(appointment._id);
      expect(updated!.status).toBe('confirmed');
    });
  });

  describe('DELETE /api/v1/appointments/:id', () => {
    it('cancels the appointment', async () => {
      const { token, patient, doctor } = await setup();
      const appointment = await AppointmentModel.create({
        patientId: patient._id,
        doctorId: doctor._id,
        clinicId: patient.clinicId,
        scheduledAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        duration: 30,
        type: 'consultation',
      });

      const res = await request(app)
        .delete(`/api/v1/appointments/${appointment._id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ cancellationReason: 'Patient request' });

      expect(res.status).toBe(200);
      const cancelled = await AppointmentModel.findById(appointment._id);
      expect(cancelled!.status).toBe('cancelled');
    });
  });
});
