/**
 * Integration tests — patient management workflows.
 *
 * Exercises the real patients controller against an in-memory MongoDB:
 *   - create / list / get / update / delete patients via the API
 *   - role + authentication enforcement
 *   - PHI encryption at rest
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

jest.mock('@api/lib/email.service', () => {
  const handler = {
    get: (_target: unknown, prop: string | symbol) =>
      typeof prop === 'string' ? jest.fn() : undefined,
  };
  return new Proxy({}, handler);
});

jest.mock('@api/realtime/socket', () => ({
  emitToClinic: jest.fn(),
  emitToUser: jest.fn(),
}));

jest.mock('@api/services/metrics.service', () => ({
  patientsCreatedTotal: { inc: jest.fn() },
}));

import express from 'express';
import request from 'supertest';
import mongoose from 'mongoose';
import { patientRoutes } from '../modules/patients/patients.controller';
import { PatientModel } from '../modules/patients/models/patient.model';
import { startTestDb, stopTestDb, clearDb, TestDb } from './helpers/test-db';
import {
  createClinicWithAdmin,
  createPatient,
  makeAccessToken,
  TokenPayload,
} from './helpers/factories';

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/v1/patients', patientRoutes);
  return app;
}

async function adminToken(payload?: Partial<TokenPayload>): Promise<{
  token: string;
  clinicId: string;
  userId: string;
}> {
  const { clinic, admin } = await createClinicWithAdmin();
  const base = {
    userId: admin._id.toString(),
    role: 'CLINIC_ADMIN',
    clinicId: clinic._id.toString(),
  };
  return {
    token: makeAccessToken({ ...base, ...payload }),
    clinicId: base.clinicId,
    userId: base.userId,
  };
}

const VALID_PATIENT_BODY = {
  firstName: 'Jane',
  lastName: 'Doe',
  dateOfBirth: '1990-05-15',
  sex: 'F',
  contactNumber: '+15551234567',
};

describe('patient management integration flows', () => {
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

  describe('POST /api/v1/patients', () => {
    it('creates a patient scoped to the caller clinic', async () => {
      const { token, clinicId } = await adminToken();

      const res = await request(app)
        .post('/api/v1/patients')
        .set('Authorization', `Bearer ${token}`)
        .send(VALID_PATIENT_BODY);

      expect(res.status).toBe(201);
      expect(res.body.status).toBe('success');
      expect(res.body.data.firstName).toBe('Jane');
      expect(res.body.data.lastName).toBe('Doe');

      const doc = await PatientModel.findById(res.body.data._id);
      expect(doc).not.toBeNull();
      expect(doc!.clinicId.toString()).toBe(clinicId);
    });

    it('encrypts PHI fields at rest', async () => {
      const { token } = await adminToken();

      const res = await request(app)
        .post('/api/v1/patients')
        .set('Authorization', `Bearer ${token}`)
        .send(VALID_PATIENT_BODY);

      // Query the raw MongoDB collection to bypass the model's transparent
      // decrypt-on-read hooks — PHI must be stored encrypted.
      const raw = await mongoose.connection.db
        .collection('patients')
        .findOne({ _id: new mongoose.Types.ObjectId(res.body.data._id) });
      expect(String(raw!.contactNumber)).not.toContain('5551234567');
      expect(String(raw!.dateOfBirth)).not.toContain('1990-05-15');
    });

    it('rejects an unauthenticated request', async () => {
      const res = await request(app).post('/api/v1/patients').send(VALID_PATIENT_BODY);
      expect(res.status).toBe(401);
    });

    it('returns 400 for an invalid body', async () => {
      const { token } = await adminToken();
      const res = await request(app)
        .post('/api/v1/patients')
        .set('Authorization', `Bearer ${token}`)
        .send({ firstName: 'NoLastName' });
      expect(res.status).toBe(400);
    });

    it('rejects a non-staff role', async () => {
      const { token } = await adminToken({ role: 'PATIENT' });
      const res = await request(app)
        .post('/api/v1/patients')
        .set('Authorization', `Bearer ${token}`)
        .send(VALID_PATIENT_BODY);
      expect(res.status).toBe(403);
    });
  });

  describe('GET /api/v1/patients', () => {
    it('lists patients for the clinic', async () => {
      const { token, clinicId } = await adminToken();
      await createPatient({ clinicId: new mongoose.Types.ObjectId(clinicId) });

      const res = await request(app)
        .get('/api/v1/patients')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeGreaterThan(0);
      const names = res.body.data.map((p: { firstName: string }) => p.firstName);
      expect(names).toContain('Jane');
    });
  });

  describe('GET /api/v1/patients/:id', () => {
    it('returns the patient by id', async () => {
      const { token, clinicId } = await adminToken();
      const patient = await createPatient({
        clinicId: new mongoose.Types.ObjectId(clinicId),
      });

      const res = await request(app)
        .get(`/api/v1/patients/${patient._id}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.data._id).toBe(patient._id.toString());
    });

    it('returns 404 for an unknown id', async () => {
      const { token } = await adminToken();
      const res = await request(app)
        .get(`/api/v1/patients/${new mongoose.Types.ObjectId()}`)
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(404);
    });
  });

  describe('PUT /api/v1/patients/:id', () => {
    it('updates patient fields (full replacement body)', async () => {
      const { token, clinicId } = await adminToken();
      const patient = await createPatient({
        clinicId: new mongoose.Types.ObjectId(clinicId),
      });

      const res = await request(app)
        .put(`/api/v1/patients/${patient._id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ ...VALID_PATIENT_BODY, firstName: 'Janet' });

      expect(res.status).toBe(200);
      expect(res.body.data.firstName).toBe('Janet');
      const updated = await PatientModel.findById(patient._id);
      expect(updated!.firstName).toBe('Janet');
    });
  });

  describe('DELETE /api/v1/patients/:id', () => {
    it('soft-deletes the patient (isActive=false)', async () => {
      const { token, clinicId } = await adminToken();
      const patient = await createPatient({
        clinicId: new mongoose.Types.ObjectId(clinicId),
      });

      const res = await request(app)
        .delete(`/api/v1/patients/${patient._id}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      const doc = await PatientModel.findById(patient._id);
      expect(doc!.isActive).toBe(false);
    });
  });
});
