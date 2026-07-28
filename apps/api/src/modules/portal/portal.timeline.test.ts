import request from 'supertest';
import { Types } from 'mongoose';
import express from 'express';
import { portalRoutes } from './portal.controller';
import { EncounterModel } from '../encounters/encounter.model';
import { LabResultModel } from '../lab-results/lab-result.model';
import { ImmunizationModel } from '../immunizations/immunization.model';
import { AppointmentModel } from '../appointments/appointment.model';

// ── Mocks ─────────────────────────────────────────────────────────────────────

jest.mock('../auth/totp.service');
jest.mock('@api/lib/email.service');
jest.mock('@api/utils/logger');
jest.mock('../ai/ai.service', () => ({
  isAIServiceAvailable: jest.fn(() => false),
  generatePatientFriendlySummary: jest.fn(),
}));
jest.mock('@api/middlewares/auth.middleware', () => ({
  authenticate: (req: any, _res: any, next: any) => {
    req.user = {
      userId: new Types.ObjectId().toString(),
      role: 'PATIENT',
      clinicId: testClinicId,
      patientId: testPatientId,
    };
    next();
  },
  requireRoles: () => (_req: any, _res: any, next: any) => next(),
}));
jest.mock('./portal-mfa.routes', () => ({ portalMfaRoutes: require('express').Router() }));
jest.mock('../export/export-request.controller', () => ({
  exportRequestRoutes: require('express').Router(),
}));

// ── Shared IDs ────────────────────────────────────────────────────────────────

const testPatientId = new Types.ObjectId().toString();
const testClinicId = new Types.ObjectId().toString();

function makeFind(results: unknown[]) {
  return jest.fn().mockReturnValue({
    sort: jest.fn().mockReturnValue({
      lean: jest.fn().mockResolvedValue(results),
    }),
  });
}

// ── Setup ─────────────────────────────────────────────────────────────────────

describe('Portal Timeline Routes', () => {
  let app: express.Application;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use('/api/v1/portal', portalRoutes);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // ── Empty state ────────────────────────────────────────────────────────────

  describe('GET /api/v1/portal/timeline', () => {
    it('returns empty timeline when no events exist', async () => {
      jest.spyOn(EncounterModel, 'find').mockImplementation(makeFind([]));
      jest.spyOn(LabResultModel, 'find').mockImplementation(makeFind([]));
      jest.spyOn(ImmunizationModel, 'find').mockImplementation(makeFind([]));
      jest.spyOn(AppointmentModel, 'find').mockImplementation(makeFind([]));

      const res = await request(app).get('/api/v1/portal/timeline');

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(res.body.data).toEqual([]);
      expect(res.body.meta.total).toBe(0);
    });

    // ── Chronological ordering ────────────────────────────────────────────────

    it('returns all events sorted most-recent first', async () => {
      const patientId = new Types.ObjectId(testPatientId);
      const clinicId = new Types.ObjectId(testClinicId);

      const mockEncounter = {
        _id: new Types.ObjectId(),
        patientId,
        clinicId,
        type: 'consultation',
        chiefComplaint: 'Headache',
        status: 'closed',
        isActive: true,
        createdAt: new Date('2024-03-15'),
      };

      const mockLabResult = {
        _id: new Types.ObjectId(),
        patientId,
        clinicId,
        testName: 'CBC',
        status: 'resulted',
        orderedAt: new Date('2024-03-10'),
        resultedAt: new Date('2024-03-10'),
        results: [{ parameter: 'WBC', value: '7.2', unit: 'K/uL', referenceRange: '4-11' }],
        createdAt: new Date('2024-03-10'),
      };

      const mockImmunization = {
        _id: new Types.ObjectId(),
        patientId,
        clinicId,
        vaccineName: 'Influenza',
        vaccineCode: '88',
        administeredDate: new Date('2024-02-20'),
        doseNumber: 1,
        seriesComplete: false,
        isActive: true,
        createdAt: new Date('2024-02-20'),
      };

      const mockAppointment = {
        _id: new Types.ObjectId(),
        patientId,
        clinicId,
        type: 'follow-up',
        status: 'completed',
        scheduledAt: new Date('2024-01-15'),
        createdAt: new Date('2024-01-10'),
      };

      jest.spyOn(EncounterModel, 'find').mockImplementation(makeFind([mockEncounter]));
      jest.spyOn(LabResultModel, 'find').mockImplementation(makeFind([mockLabResult]));
      jest.spyOn(ImmunizationModel, 'find').mockImplementation(makeFind([mockImmunization]));
      jest.spyOn(AppointmentModel, 'find').mockImplementation(makeFind([mockAppointment]));

      const res = await request(app).get('/api/v1/portal/timeline');

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(4);
      // Most recent first
      expect(res.body.data[0].type).toBe('encounter');
      expect(res.body.data[1].type).toBe('lab_result');
      expect(res.body.data[2].type).toBe('immunization');
      expect(res.body.data[3].type).toBe('appointment');
      expect(res.body.meta.total).toBe(4);
    });

    // ── eventType filter ──────────────────────────────────────────────────────

    it('only queries the matching model when eventType=encounter', async () => {
      jest.spyOn(EncounterModel, 'find').mockImplementation(makeFind([]));
      const labSpy = jest.spyOn(LabResultModel, 'find').mockImplementation(makeFind([]));
      const immSpy = jest.spyOn(ImmunizationModel, 'find').mockImplementation(makeFind([]));
      const apptSpy = jest.spyOn(AppointmentModel, 'find').mockImplementation(makeFind([]));

      await request(app).get('/api/v1/portal/timeline?eventType=encounter');

      expect(EncounterModel.find).toHaveBeenCalled();
      expect(labSpy).not.toHaveBeenCalled();
      expect(immSpy).not.toHaveBeenCalled();
      expect(apptSpy).not.toHaveBeenCalled();
    });

    it('only queries lab results when eventType=lab_result', async () => {
      const encSpy = jest.spyOn(EncounterModel, 'find').mockImplementation(makeFind([]));
      jest.spyOn(LabResultModel, 'find').mockImplementation(makeFind([]));
      const immSpy = jest.spyOn(ImmunizationModel, 'find').mockImplementation(makeFind([]));
      const apptSpy = jest.spyOn(AppointmentModel, 'find').mockImplementation(makeFind([]));

      await request(app).get('/api/v1/portal/timeline?eventType=lab_result');

      expect(LabResultModel.find).toHaveBeenCalled();
      expect(encSpy).not.toHaveBeenCalled();
      expect(immSpy).not.toHaveBeenCalled();
      expect(apptSpy).not.toHaveBeenCalled();
    });

    it('only queries immunizations when eventType=immunization', async () => {
      const encSpy = jest.spyOn(EncounterModel, 'find').mockImplementation(makeFind([]));
      const labSpy = jest.spyOn(LabResultModel, 'find').mockImplementation(makeFind([]));
      jest.spyOn(ImmunizationModel, 'find').mockImplementation(makeFind([]));
      const apptSpy = jest.spyOn(AppointmentModel, 'find').mockImplementation(makeFind([]));

      await request(app).get('/api/v1/portal/timeline?eventType=immunization');

      expect(ImmunizationModel.find).toHaveBeenCalled();
      expect(encSpy).not.toHaveBeenCalled();
      expect(labSpy).not.toHaveBeenCalled();
      expect(apptSpy).not.toHaveBeenCalled();
    });

    it('only queries appointments when eventType=appointment', async () => {
      const encSpy = jest.spyOn(EncounterModel, 'find').mockImplementation(makeFind([]));
      const labSpy = jest.spyOn(LabResultModel, 'find').mockImplementation(makeFind([]));
      const immSpy = jest.spyOn(ImmunizationModel, 'find').mockImplementation(makeFind([]));
      jest.spyOn(AppointmentModel, 'find').mockImplementation(makeFind([]));

      await request(app).get('/api/v1/portal/timeline?eventType=appointment');

      expect(AppointmentModel.find).toHaveBeenCalled();
      expect(encSpy).not.toHaveBeenCalled();
      expect(labSpy).not.toHaveBeenCalled();
      expect(immSpy).not.toHaveBeenCalled();
    });

    it('extracts prescriptions from encounters when eventType=prescription', async () => {
      const patientId = new Types.ObjectId(testPatientId);
      const clinicId = new Types.ObjectId(testClinicId);

      const mockEncounterWithRx = {
        _id: new Types.ObjectId(),
        patientId,
        clinicId,
        type: 'consultation',
        chiefComplaint: 'Chest pain',
        status: 'closed',
        isActive: true,
        createdAt: new Date('2024-03-15'),
        prescriptions: [
          {
            drugName: 'Atorvastatin',
            dosage: '20mg',
            frequency: 'Once daily',
            duration: '30 days',
            route: 'oral',
            prescribedAt: new Date('2024-03-15'),
            refillsAllowed: 3,
          },
        ],
      };

      jest.spyOn(EncounterModel, 'find').mockImplementation(makeFind([mockEncounterWithRx]));
      const labSpy = jest.spyOn(LabResultModel, 'find').mockImplementation(makeFind([]));
      const immSpy = jest.spyOn(ImmunizationModel, 'find').mockImplementation(makeFind([]));
      const apptSpy = jest.spyOn(AppointmentModel, 'find').mockImplementation(makeFind([]));

      const res = await request(app).get('/api/v1/portal/timeline?eventType=prescription');

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].type).toBe('prescription');
      expect(res.body.data[0].title).toContain('Atorvastatin');
      expect(labSpy).not.toHaveBeenCalled();
      expect(immSpy).not.toHaveBeenCalled();
      expect(apptSpy).not.toHaveBeenCalled();
    });

    // ── Date range filtering ──────────────────────────────────────────────────

    it('passes date range to model queries', async () => {
      const patientId = new Types.ObjectId(testPatientId);
      const clinicId = new Types.ObjectId(testClinicId);

      const mockEncounter = {
        _id: new Types.ObjectId(),
        patientId,
        clinicId,
        type: 'consultation',
        chiefComplaint: 'Checkup',
        status: 'closed',
        isActive: true,
        createdAt: new Date('2024-03-15'),
      };

      jest.spyOn(EncounterModel, 'find').mockImplementation(makeFind([mockEncounter]));
      jest.spyOn(LabResultModel, 'find').mockImplementation(makeFind([]));
      jest.spyOn(ImmunizationModel, 'find').mockImplementation(makeFind([]));
      jest.spyOn(AppointmentModel, 'find').mockImplementation(makeFind([]));

      const res = await request(app).get(
        '/api/v1/portal/timeline?startDate=2024-03-01T00:00:00.000Z&endDate=2024-03-31T23:59:59.999Z'
      );

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].type).toBe('encounter');
    });

    // ── Pagination ────────────────────────────────────────────────────────────

    it('paginates results correctly', async () => {
      const patientId = new Types.ObjectId(testPatientId);
      const clinicId = new Types.ObjectId(testClinicId);

      const encounters = Array.from({ length: 5 }, (_, i) => ({
        _id: new Types.ObjectId(),
        patientId,
        clinicId,
        type: 'consultation' as const,
        chiefComplaint: `Visit ${i + 1}`,
        status: 'closed',
        isActive: true,
        createdAt: new Date(2024, 2, 15 - i),
      }));

      jest.spyOn(EncounterModel, 'find').mockImplementation(makeFind(encounters));
      jest.spyOn(LabResultModel, 'find').mockImplementation(makeFind([]));
      jest.spyOn(ImmunizationModel, 'find').mockImplementation(makeFind([]));
      jest.spyOn(AppointmentModel, 'find').mockImplementation(makeFind([]));

      const res = await request(app).get('/api/v1/portal/timeline?page=1&limit=2');

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(2);
      expect(res.body.meta.page).toBe(1);
      expect(res.body.meta.limit).toBe(2);
      expect(res.body.meta.total).toBe(5);
      expect(res.body.meta.totalPages).toBe(3);
      expect(res.body.meta.hasNextPage).toBe(true);
      expect(res.body.meta.hasPrevPage).toBe(false);
    });

    it('returns page 2 correctly', async () => {
      const patientId = new Types.ObjectId(testPatientId);
      const clinicId = new Types.ObjectId(testClinicId);

      const encounters = Array.from({ length: 5 }, (_, i) => ({
        _id: new Types.ObjectId(),
        patientId,
        clinicId,
        type: 'consultation' as const,
        chiefComplaint: `Visit ${i + 1}`,
        status: 'closed',
        isActive: true,
        createdAt: new Date(2024, 2, 15 - i),
      }));

      jest.spyOn(EncounterModel, 'find').mockImplementation(makeFind(encounters));
      jest.spyOn(LabResultModel, 'find').mockImplementation(makeFind([]));
      jest.spyOn(ImmunizationModel, 'find').mockImplementation(makeFind([]));
      jest.spyOn(AppointmentModel, 'find').mockImplementation(makeFind([]));

      const res = await request(app).get('/api/v1/portal/timeline?page=2&limit=2');

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(2);
      expect(res.body.meta.page).toBe(2);
      expect(res.body.meta.hasPrevPage).toBe(true);
      expect(res.body.meta.hasNextPage).toBe(true);
    });

    // ── Validation ────────────────────────────────────────────────────────────

    it('rejects limit exceeding 100', async () => {
      const res = await request(app).get('/api/v1/portal/timeline?limit=101');
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('ValidationError');
    });

    it('rejects an invalid eventType', async () => {
      const res = await request(app).get('/api/v1/portal/timeline?eventType=unknown_type');
      expect(res.status).toBe(400);
    });

    // ── Shape of returned events ──────────────────────────────────────────────

    it('returns well-shaped encounter events', async () => {
      const patientId = new Types.ObjectId(testPatientId);
      const clinicId = new Types.ObjectId(testClinicId);

      const enc = {
        _id: new Types.ObjectId(),
        patientId,
        clinicId,
        type: 'consultation',
        chiefComplaint: 'Back pain',
        status: 'closed',
        isActive: true,
        createdAt: new Date('2024-04-01'),
      };

      jest.spyOn(EncounterModel, 'find').mockImplementation(makeFind([enc]));
      jest.spyOn(LabResultModel, 'find').mockImplementation(makeFind([]));
      jest.spyOn(ImmunizationModel, 'find').mockImplementation(makeFind([]));
      jest.spyOn(AppointmentModel, 'find').mockImplementation(makeFind([]));

      const res = await request(app).get('/api/v1/portal/timeline?eventType=encounter');

      expect(res.status).toBe(200);
      const event = res.body.data[0];
      expect(event).toHaveProperty('id');
      expect(event).toHaveProperty('type', 'encounter');
      expect(event).toHaveProperty('date');
      expect(event).toHaveProperty('title');
      expect(event).toHaveProperty('description');
      expect(event).toHaveProperty('details');
      expect(event).toHaveProperty('clinicId');
      expect(event).toHaveProperty('createdAt');
    });
  });
});