import request from 'supertest';
import { Types } from 'mongoose';
import express from 'express';
import { portalRoutes } from './portal.controller';
import { EncounterModel } from '../encounters/encounter.model';
import { LabResultModel } from '../lab-results/lab-result.model';
import { ImmunizationModel } from '../immunizations/immunization.model';
import { AppointmentModel } from '../appointments/appointment.model';

jest.mock('../auth/totp.service');
jest.mock('@api/lib/email.service');
jest.mock('@api/utils/logger');

function setupAuth(app: express.Application) {
  app.use((req: any, _res, next) => {
    req.user = {
      userId: new Types.ObjectId().toString(),
      role: 'PATIENT',
      clinicId: new Types.ObjectId().toString(),
      patientId: new Types.ObjectId().toString(),
    };
    next();
  });
}

describe('Portal Timeline Routes', () => {
  let app: express.Application;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    setupAuth(app);
    app.use('/api/v1/portal', portalRoutes);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('GET /api/v1/portal/timeline', () => {
    it('should return empty timeline when no events exist', async () => {
      jest.spyOn(EncounterModel, 'find').mockReturnValue({
        sort: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue([]) }),
      } as any);
      jest.spyOn(LabResultModel, 'find').mockReturnValue({
        sort: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue([]) }),
      } as any);
      jest.spyOn(ImmunizationModel, 'find').mockReturnValue({
        sort: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue([]) }),
      } as any);
      jest.spyOn(AppointmentModel, 'find').mockReturnValue({
        sort: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue([]) }),
      } as any);

      const res = await request(app).get('/api/v1/portal/timeline');

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(res.body.data).toEqual([]);
      expect(res.body.meta.total).toBe(0);
    });

    it('should return all events in chronological order', async () => {
      const clinicId = new Types.ObjectId();
      const patientId = new Types.ObjectId();

      const mockEncounter = {
        _id: new Types.ObjectId(),
        patientId,
        clinicId,
        type: 'consultation',
        chiefComplaint: 'Headache',
        status: 'closed',
        createdAt: new Date('2024-03-15'),
      };

      const mockLabResult = {
        _id: new Types.ObjectId(),
        patientId,
        clinicId,
        testName: 'CBC',
        status: 'resulted',
        results: [{ parameter: 'WBC', value: '7.2', unit: 'K/uL' }],
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
        manufacturer: 'Sanofi',
        createdAt: new Date('2024-02-20'),
      };

      const mockAppointment = {
        _id: new Types.ObjectId(),
        patientId,
        clinicId,
        type: 'follow-up',
        status: 'completed',
        scheduledAt: new Date('2024-01-15'),
        chiefComplaint: 'Follow-up check',
        createdAt: new Date('2024-01-10'),
      };

      jest.spyOn(EncounterModel, 'find').mockReturnValue({
        sort: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue([mockEncounter]) }),
      } as any);
      jest.spyOn(LabResultModel, 'find').mockReturnValue({
        sort: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue([mockLabResult]) }),
      } as any);
      jest.spyOn(ImmunizationModel, 'find').mockReturnValue({
        sort: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue([mockImmunization]) }),
      } as any);
      jest.spyOn(AppointmentModel, 'find').mockReturnValue({
        sort: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue([mockAppointment]) }),
      } as any);

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

    it('should filter by eventType', async () => {
      const findMock = jest.fn().mockReturnValue({
        sort: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue([]) }),
      });
      jest.spyOn(EncounterModel, 'find').mockImplementation(findMock);
      jest.spyOn(LabResultModel, 'find').mockImplementation(findMock);
      jest.spyOn(ImmunizationModel, 'find').mockReturnValue({
        sort: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue([]) }),
      } as any);
      jest.spyOn(AppointmentModel, 'find').mockImplementation(findMock);

      await request(app).get('/api/v1/portal/timeline?eventType=encounter');

      expect(EncounterModel.find).toHaveBeenCalled();
      expect(ImmunizationModel.find).not.toHaveBeenCalled();
      expect(LabResultModel.find).not.toHaveBeenCalled();
      expect(AppointmentModel.find).not.toHaveBeenCalled();
    });

    it('should filter by date range', async () => {
      const clinicId = new Types.ObjectId();
      const patientId = new Types.ObjectId();

      const mockEncounter = {
        _id: new Types.ObjectId(),
        patientId,
        clinicId,
        type: 'consultation',
        chiefComplaint: 'Checkup',
        status: 'closed',
        createdAt: new Date('2024-03-15'),
      };

      jest.spyOn(EncounterModel, 'find').mockReturnValue({
        sort: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue([mockEncounter]) }),
      } as any);
      jest.spyOn(LabResultModel, 'find').mockReturnValue({
        sort: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue([]) }),
      } as any);
      jest.spyOn(ImmunizationModel, 'find').mockReturnValue({
        sort: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue([]) }),
      } as any);
      jest.spyOn(AppointmentModel, 'find').mockReturnValue({
        sort: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue([]) }),
      } as any);

      const res = await request(app).get(
        '/api/v1/portal/timeline?startDate=2024-03-01T00:00:00.000Z&endDate=2024-03-31T23:59:59.999Z',
      );

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].type).toBe('encounter');
    });

    it('should paginate results', async () => {
      const clinicId = new Types.ObjectId();
      const patientId = new Types.ObjectId();

      const encounters = Array.from({ length: 5 }, (_, i) => ({
        _id: new Types.ObjectId(),
        patientId,
        clinicId,
        type: 'consultation' as const,
        chiefComplaint: `Visit ${i + 1}`,
        status: 'closed' as const,
        createdAt: new Date(2024, 2, 15 - i),
      }));

      jest.spyOn(EncounterModel, 'find').mockReturnValue({
        sort: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(encounters) }),
      } as any);
      jest.spyOn(LabResultModel, 'find').mockReturnValue({
        sort: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue([]) }),
      } as any);
      jest.spyOn(ImmunizationModel, 'find').mockReturnValue({
        sort: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue([]) }),
      } as any);
      jest.spyOn(AppointmentModel, 'find').mockReturnValue({
        sort: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue([]) }),
      } as any);

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

    it('should reject limit exceeding 100', async () => {
      const res = await request(app).get('/api/v1/portal/timeline?limit=101');
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('ValidationError');
    });

    it('should extract prescriptions from encounters', async () => {
      const clinicId = new Types.ObjectId();
      const patientId = new Types.ObjectId();

      const mockEncounter = {
        _id: new Types.ObjectId(),
        patientId,
        clinicId,
        type: 'consultation',
        chiefComplaint: 'Chest pain',
        status: 'closed',
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

      jest.spyOn(EncounterModel, 'find').mockReturnValue({
        sort: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue([mockEncounter]) }),
      } as any);
      jest.spyOn(LabResultModel, 'find').mockReturnValue({
        sort: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue([]) }),
      } as any);
      jest.spyOn(ImmunizationModel, 'find').mockReturnValue({
        sort: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue([]) }),
      } as any);
      jest.spyOn(AppointmentModel, 'find').mockReturnValue({
        sort: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue([]) }),
      } as any);

      // Mock second query for prescriptions
      jest.spyOn(EncounterModel, 'find').mockReturnValue({
        sort: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue([]) }),
      } as any);

      const res = await request(app).get('/api/v1/portal/timeline?eventType=prescription');

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(0);
    });
  });
});
