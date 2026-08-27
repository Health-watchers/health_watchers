/**
 * Unit tests for patient list query optimization — Issue #1069
 *
 * Verifies:
 *  - Selective field projection is applied (only list-view fields returned)
 *  - Query hint 'clinicId_1_isActive_1' is passed to paginate
 *  - Cache is checked before executing DB query (cache-hit path)
 *  - Cache is populated after DB query (cache-miss path)
 *  - Cache invalidation fires on create / update / delete
 */

// ── Env stubs ─────────────────────────────────────────────────────────────────
process.env.JWT_ACCESS_TOKEN_SECRET = 'test-access-secret-32-chars-long!!';
process.env.JWT_REFRESH_TOKEN_SECRET = 'test-refresh-secret-32-chars-long!';
process.env.FIELD_ENCRYPTION_KEY = 'abcdefghijklmnopqrstuvwxyz012345';

// ── Module mocks ──────────────────────────────────────────────────────────────
jest.mock('@health-watchers/config', () => ({
  config: {
    jwt: {
      accessTokenSecret: 'test-access-secret-32-chars-long!!',
      refreshTokenSecret: 'test-refresh-secret-32-chars-long!',
      issuer: 'health-watchers-api',
      audience: 'health-watchers-client',
    },
    fieldEncryptionKey: 'abcdefghijklmnopqrstuvwxyz012345',
    nodeEnv: 'test',
  },
}));

jest.mock('@api/lib/encrypt', () => ({ encrypt: (v: string) => v, decrypt: (v: string) => v }));
jest.mock('@api/utils/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));
jest.mock('@api/realtime/socket', () => ({ emitToClinic: jest.fn(), emitToUser: jest.fn() }));
jest.mock('@api/modules/subscriptions/usage.service', () => ({ incrementUsage: jest.fn() }));
jest.mock('@api/services/metrics.service', () => ({ patientsCreatedTotal: { inc: jest.fn() } }));
jest.mock('@api/utils/tracer', () => ({
  withSpan: jest.fn((_name: string, _attrs: unknown, fn: () => unknown) => fn()),
}));
jest.mock('@api/modules/audit/audit.service', () => ({ auditLog: jest.fn() }));
jest.mock('@api/lib/email.service', () => ({ sendMail: jest.fn() }));

// Stub cache service
const mockCache = {
  get: jest.fn().mockResolvedValue(null),
  set: jest.fn().mockResolvedValue(undefined),
  del: jest.fn().mockResolvedValue(undefined),
  delPattern: jest.fn().mockResolvedValue(undefined),
  invalidatePatientList: jest.fn().mockResolvedValue(undefined),
  invalidateReports: jest.fn().mockResolvedValue(undefined),
};
jest.mock('@api/services/cache.service', () => ({ cache: mockCache }));

// Stub paginate utility
const mockPaginate = jest.fn().mockResolvedValue({
  data: [],
  meta: { total: 0, page: 1, limit: 20, totalPages: 0, hasNextPage: false, hasPrevPage: false, nextCursor: null },
});
jest.mock('@api/utils/paginate', () => ({
  paginate: mockPaginate,
  parsePagination: jest.fn(),
}));

// Stub PatientModel
const mockPatientCreate = jest.fn();
const mockPatientFindOne = jest.fn();
const mockPatientFindOneAndUpdate = jest.fn();
const mockPatientCounterFindOneAndUpdate = jest.fn().mockResolvedValue({ value: 1 });

jest.mock('@api/modules/patients/models/patient.model', () => ({
  PatientModel: {
    find: jest.fn(),
    findById: jest.fn(),
    findOne: mockPatientFindOne,
    findOneAndUpdate: mockPatientFindOneAndUpdate,
    create: mockPatientCreate,
    countDocuments: jest.fn().mockResolvedValue(0),
    aggregate: jest.fn().mockResolvedValue([]),
  },
}));
jest.mock('@api/modules/patients/models/patient-counter.model', () => ({
  PatientCounterModel: { findOneAndUpdate: mockPatientCounterFindOneAndUpdate },
}));

// Stubs for related models
jest.mock('@api/modules/auth/models/user.model', () => ({ UserModel: { findOne: jest.fn() } }));
jest.mock('@api/modules/portal/models/portal-message.model', () => ({ PortalMessageModel: { create: jest.fn() } }));
jest.mock('@api/modules/payments/models/payment-record.model', () => ({ PaymentRecordModel: { find: jest.fn().mockResolvedValue([]) } }));
jest.mock('@api/modules/encounters/encounter.model', () => ({ EncounterModel: { find: jest.fn().mockResolvedValue([]) } }));
jest.mock('@api/modules/lab-results/lab-result.model', () => ({ LabResultModel: { find: jest.fn().mockResolvedValue([]) } }));
jest.mock('@api/modules/patients/duplicate-detection.service', () => ({ DuplicateDetectionService: { findPotentialDuplicates: jest.fn().mockResolvedValue([]) } }));
jest.mock('@api/middlewares/common.middleware', () => ({ isValidObjectId: jest.fn((_req: any, _res: any, next: any) => next()) }));
jest.mock('@api/middlewares/subscription.middleware', () => ({ checkSubscriptionLimit: jest.fn(() => (_req: any, _res: any, next: any) => next()) }));
jest.mock('@api/modules/patients/patients.transformer', () => ({ toPatientResponse: jest.fn((d: any) => d) }));
jest.mock('@api/modules/communications/communications.controller', () => ({ communicationsRouter: require('express').Router() }));
jest.mock('@api/modules/payments/payments.transformer', () => ({ toPaymentResponse: jest.fn((d: any) => d) }));
jest.mock('@api/modules/encounters/encounters.transformer', () => ({ toEncounterResponse: jest.fn((d: any) => d) }));
jest.mock('@api/middlewares/auth.middleware', () => ({
  authenticate: jest.fn((_req: any, _res: any, next: any) => next()),
  requireRoles: jest.fn(() => (_req: any, _res: any, next: any) => next()),
}));

import request from 'supertest';
import express from 'express';
import { patientRoutes } from '../patients.controller';

// ── Build a minimal app ───────────────────────────────────────────────────────
const app = express();
app.use(express.json());
app.use((req: any, _res: any, next: any) => {
  req.user = {
    userId: 'user-1',
    clinicId: 'clinic-abc-123',
    role: 'CLINIC_ADMIN',
  };
  next();
});
app.use('/patients', patientRoutes);

const CLINIC_ID = 'clinic-abc-123';

// ── Tests ─────────────────────────────────────────────────────────────────────
beforeEach(() => {
  jest.clearAllMocks();
  mockCache.get.mockResolvedValue(null); // default: cache miss
});

describe('#1069 Patient list query optimization', () => {
  describe('GET /patients — selective projection + query hint', () => {
    it('calls paginate with selective listProjection and clinicId_1_isActive_1 hint', async () => {
      await request(app).get('/patients').expect(200);

      expect(mockPaginate).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ isActive: true, clinicId: CLINIC_ID }),
        1,
        20,
        { createdAt: -1 },
        expect.objectContaining({
          projection: expect.objectContaining({
            systemId: 1,
            firstName: 1,
            lastName: 1,
            riskLevel: 1,
            riskScore: 1,
          }),
          hint: 'clinicId_1_isActive_1',
        })
      );
    });

    it('projection does NOT include sensitive PHI fields not needed for list view', async () => {
      await request(app).get('/patients').expect(200);

      const callOptions = mockPaginate.mock.calls[0][5];
      const projection = callOptions.projection;
      // These fields are PHI / detail-view only — should not be in list projection
      expect(projection).not.toHaveProperty('allergies');
      expect(projection).not.toHaveProperty('insurance');
      expect(projection).not.toHaveProperty('emergencyContacts');
    });
  });

  describe('Cache-hit path', () => {
    it('returns cached data directly without calling paginate', async () => {
      const cachedPayload = {
        data: [{ systemId: 'HW-001', firstName: 'Jane' }],
        pagination: { total: 1, page: 1, limit: 20, totalPages: 1 },
      };
      mockCache.get.mockResolvedValueOnce(cachedPayload);

      const res = await request(app).get('/patients').expect(200);

      expect(mockPaginate).not.toHaveBeenCalled();
      expect(res.body.data).toEqual(cachedPayload.data);
    });

    it('uses a cache key scoped to clinicId + page + limit', async () => {
      await request(app).get('/patients?page=2&limit=10').expect(200);

      expect(mockCache.get).toHaveBeenCalledWith(
        `patients:list:${CLINIC_ID}:page=2:limit=10`
      );
    });
  });

  describe('Cache-miss path', () => {
    it('stores the result in cache with 60s TTL after a DB query', async () => {
      await request(app).get('/patients?page=1&limit=20').expect(200);

      expect(mockCache.set).toHaveBeenCalledWith(
        `patients:list:${CLINIC_ID}:page=1:limit=20`,
        expect.objectContaining({ data: expect.any(Array) }),
        60
      );
    });
  });

  describe('Cache invalidation on mutations', () => {
    it('invalidates patient list cache when a new patient is created', async () => {
      mockPatientCreate.mockResolvedValueOnce({
        _id: 'pat-1',
        systemId: 'HW-001',
        firstName: 'Alice',
        lastName: 'Smith',
        clinicId: CLINIC_ID,
        isActive: true,
        toObject: () => ({}),
      });

      await request(app)
        .post('/patients')
        .send({
          firstName: 'Alice',
          lastName: 'Smith',
          dateOfBirth: '1990-01-01',
          sex: 'F',
        })
        .expect(201);

      expect(mockCache.invalidatePatientList).toHaveBeenCalledWith(CLINIC_ID);
    });

    it('invalidates patient list cache when a patient is updated (PUT)', async () => {
      mockPatientFindOneAndUpdate.mockResolvedValueOnce({
        _id: 'pat-1',
        firstName: 'Updated',
        clinicId: CLINIC_ID,
      });

      await request(app)
        .put('/patients/507f1f77bcf86cd799439011')
        .send({ firstName: 'Updated', lastName: 'Smith', sex: 'F', dateOfBirth: '1990-01-01' })
        .expect(200);

      expect(mockCache.invalidatePatientList).toHaveBeenCalledWith(CLINIC_ID);
    });

    it('invalidates patient list cache when a patient is deleted (soft-delete)', async () => {
      mockPatientFindOneAndUpdate.mockResolvedValueOnce({
        _id: 'pat-1',
        clinicId: CLINIC_ID,
        isActive: false,
      });

      await request(app)
        .delete('/patients/507f1f77bcf86cd799439011')
        .expect(200);

      expect(mockCache.invalidatePatientList).toHaveBeenCalledWith(CLINIC_ID);
    });
  });
});
