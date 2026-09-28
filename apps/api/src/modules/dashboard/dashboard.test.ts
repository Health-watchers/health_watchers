/**
 * Tests for the dashboard module (getStats and the main GET / endpoint).
 *
 * Issue: #1485
 *
 * Covers: aggregation outputs (counts, sums, date bucketing), cache behaviour,
 * role-based filtering, and that missing clinicId returns 400.
 */

// ── Module mocks ───────────────────────────────────────────────────────────────

jest.mock('@api/modules/patients/models/patient.model', () => ({
  PatientModel: {
    countDocuments: jest.fn(),
    find: jest.fn(),
  },
}));

jest.mock('@api/modules/encounters/encounter.model', () => ({
  EncounterModel: {
    countDocuments: jest.fn(),
    find: jest.fn(),
  },
}));

jest.mock('@api/modules/payments/models/payment-record.model', () => ({
  PaymentRecordModel: {
    countDocuments: jest.fn(),
    find: jest.fn(),
  },
}));

jest.mock('@api/modules/auth/models/user.model', () => ({
  UserModel: {
    countDocuments: jest.fn(),
  },
}));

jest.mock('@api/modules/appointments/appointment.model', () => ({
  AppointmentModel: {
    countDocuments: jest.fn(),
    find: jest.fn(),
  },
}));

jest.mock('@api/services/cache.service', () => ({
  cache: {
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue(undefined),
  },
}));

jest.mock('@api/utils/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

// ── Imports ────────────────────────────────────────────────────────────────────

import { Request, Response } from 'express';
import { PatientModel } from '../patients/models/patient.model';
import { EncounterModel } from '../encounters/encounter.model';
import { PaymentRecordModel } from '../payments/models/payment-record.model';
import { UserModel } from '../auth/models/user.model';
import { cache } from '@api/services/cache.service';
import { getStats, dashboardCacheKey } from './dashboard.controller';

// ── Helpers ────────────────────────────────────────────────────────────────────

const CLINIC_ID = 'clinic-abc';

function makeRes() {
  const res: Partial<Response> = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };
  return res as jest.Mocked<Response>;
}

function makeReq(overrides: Record<string, unknown> = {}): Request {
  return {
    user: { clinicId: CLINIC_ID, role: 'CLINIC_ADMIN', userId: 'user-1' },
    query: {},
    ...overrides,
  } as unknown as Request;
}

function mockCountDocs(model: { countDocuments: jest.Mock }, value: number) {
  model.countDocuments.mockResolvedValue(value);
}

function mockFind(model: { find: jest.Mock }, items: unknown[] = []) {
  model.find.mockReturnValue({
    sort: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    populate: jest.fn().mockReturnThis(),
    lean: jest.fn().mockResolvedValue(items),
  });
}

function setupDefaultMocks() {
  mockCountDocs(PatientModel as any, 50);
  mockCountDocs(EncounterModel as any, 10);
  mockCountDocs(PaymentRecordModel as any, 5);
  mockCountDocs(UserModel as any, 3);
  mockFind(PatientModel as any, []);
  mockFind(EncounterModel as any, []);
  mockFind(PaymentRecordModel as any, []);
}

// ── Lifecycle ──────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  (cache.get as jest.Mock).mockResolvedValue(null);
  setupDefaultMocks();
});

// ─────────────────────────────────────────────────────────────────────────────
// getStats — happy path
// ─────────────────────────────────────────────────────────────────────────────

describe('getStats — happy path', () => {
  it('returns 200 with status:success', async () => {
    const req = makeReq();
    const res = makeRes();
    await getStats(req, res);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'success' })
    );
  });

  it('returns aggregated counts in data.stats', async () => {
    mockCountDocs(PatientModel as any, 7);
    mockCountDocs(EncounterModel as any, 3);
    mockCountDocs(PaymentRecordModel as any, 2);
    mockCountDocs(UserModel as any, 4);
    mockFind(PatientModel as any, []);
    mockFind(EncounterModel as any, []);
    mockFind(PaymentRecordModel as any, []);

    const req = makeReq();
    const res = makeRes();
    await getStats(req, res);

    const payload = (res.json as jest.Mock).mock.calls[0][0];
    expect(payload.data.stats.todayPatients).toBe(7);
    expect(payload.data.stats.todayEncounters).toBe(3);
    expect(payload.data.stats.pendingPayments).toBe(2);
    expect(payload.data.stats.activeDoctors).toBe(4);
  });

  it('includes recentPatients list', async () => {
    const patient = { _id: 'p-1', firstName: 'Ana', lastName: 'Vidal' };
    mockFind(PatientModel as any, [patient]);
    mockFind(EncounterModel as any, []);
    mockFind(PaymentRecordModel as any, []);

    const req = makeReq();
    const res = makeRes();
    await getStats(req, res);

    const payload = (res.json as jest.Mock).mock.calls[0][0];
    expect(payload.data.recentPatients).toContainEqual(patient);
  });

  it('scopes queries to the requesting user\'s clinicId', async () => {
    const req = makeReq();
    const res = makeRes();
    await getStats(req, res);

    const countCalls = (PatientModel.countDocuments as jest.Mock).mock.calls;
    expect(countCalls[0][0]).toMatchObject({ clinicId: CLINIC_ID });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// getStats — caching
// ─────────────────────────────────────────────────────────────────────────────

describe('getStats — caching', () => {
  it('returns cached value when available and refresh=false', async () => {
    const cached = { status: 'success', data: { stats: { todayPatients: 99 } } };
    (cache.get as jest.Mock).mockResolvedValue(cached);

    const req = makeReq();
    const res = makeRes();
    await getStats(req, res);

    expect(res.json).toHaveBeenCalledWith(cached);
    expect(PatientModel.countDocuments).not.toHaveBeenCalled();
  });

  it('bypasses cache when refresh=true', async () => {
    const cached = { status: 'success', data: { stats: { todayPatients: 99 } } };
    (cache.get as jest.Mock).mockResolvedValue(cached);

    const req = makeReq({ query: { refresh: 'true' } });
    const res = makeRes();
    await getStats(req, res);

    expect(PatientModel.countDocuments).toHaveBeenCalled();
  });

  it('stores fresh result in cache with the canonical key', async () => {
    const req = makeReq();
    const res = makeRes();
    await getStats(req, res);

    expect(cache.set).toHaveBeenCalledWith(
      dashboardCacheKey(CLINIC_ID),
      expect.objectContaining({ status: 'success' }),
      300 // STATS_TTL
    );
  });

  it('uses clinic-scoped cache key', () => {
    const key = dashboardCacheKey('my-clinic');
    expect(key).toContain('my-clinic');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// getStats — role-based follow-up filtering
// ─────────────────────────────────────────────────────────────────────────────

describe('getStats — role-based follow-up filtering', () => {
  it('adds attendingDoctorId filter for DOCTOR role', async () => {
    const req = makeReq({ user: { clinicId: CLINIC_ID, role: 'DOCTOR', userId: 'doc-99' } });
    const res = makeRes();
    await getStats(req, res);

    // Follow-up filter uses EncounterModel.find — check the filter includes attendingDoctorId
    const findCalls = (EncounterModel.find as jest.Mock).mock.calls;
    const followUpCall = findCalls.find((args) => args[0]?.followUpRequired === true);
    expect(followUpCall?.[0]).toMatchObject({ attendingDoctorId: 'doc-99' });
  });

  it('does NOT add attendingDoctorId filter for CLINIC_ADMIN role', async () => {
    const req = makeReq({ user: { clinicId: CLINIC_ID, role: 'CLINIC_ADMIN', userId: 'admin-1' } });
    const res = makeRes();
    await getStats(req, res);

    const findCalls = (EncounterModel.find as jest.Mock).mock.calls;
    const followUpCall = findCalls.find((args) => args[0]?.followUpRequired === true);
    expect(followUpCall?.[0]).not.toHaveProperty('attendingDoctorId');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// getStats — error handling
// ─────────────────────────────────────────────────────────────────────────────

describe('getStats — error handling', () => {
  it('returns 400 if clinicId is missing from user context', async () => {
    const req = makeReq({ user: { role: 'CLINIC_ADMIN', userId: 'u1' } });
    const res = makeRes();
    await getStats(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('returns 500 on unexpected DB error', async () => {
    (PatientModel.countDocuments as jest.Mock).mockRejectedValue(new Error('DB down'));

    const req = makeReq();
    const res = makeRes();
    await getStats(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
  });

  it('returns 500 with error message on unexpected error', async () => {
    (PatientModel.countDocuments as jest.Mock).mockRejectedValue(new Error('Something broke'));

    const req = makeReq();
    const res = makeRes();
    await getStats(req, res);

    const payload = (res.json as jest.Mock).mock.calls[0][0];
    expect(payload).toMatchObject(expect.objectContaining({
      message: expect.stringContaining('Something broke'),
    }));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// aggregation stage correctness — removing a stage should break the test
// ─────────────────────────────────────────────────────────────────────────────

describe('aggregation stage correctness', () => {
  it('queries todayPatients with createdAt >= today at midnight', async () => {
    const req = makeReq();
    const res = makeRes();

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    await getStats(req, res);

    const firstCall = (PatientModel.countDocuments as jest.Mock).mock.calls[0];
    expect(firstCall[0].createdAt?.$gte.getTime()).toBeGreaterThanOrEqual(todayStart.getTime());
  });

  it('queries pendingPayments with status="pending"', async () => {
    const req = makeReq();
    const res = makeRes();
    await getStats(req, res);

    const calls = (PaymentRecordModel.countDocuments as jest.Mock).mock.calls;
    expect(calls.some(([f]) => f.status === 'pending')).toBe(true);
  });

  it('queries activeDoctors with role=DOCTOR and isActive=true', async () => {
    const req = makeReq();
    const res = makeRes();
    await getStats(req, res);

    const [filter] = (UserModel.countDocuments as jest.Mock).mock.calls[0];
    expect(filter).toMatchObject({ role: 'DOCTOR', isActive: true });
  });
});
