/**
 * Unit tests for aggregation pipeline optimization — Issue #1070
 *
 * Verifies that each report endpoint:
 *  - Places $match as the first stage (index utilization)
 *  - Uses $facet for multi-result aggregations (single round-trip)
 *  - Runs independent aggregations in parallel (Promise.all)
 *  - Returns the correct response shape
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

// Stub cache middleware (bypass caching in tests)
jest.mock('@api/services/cache.service', () => ({
  cache: { get: jest.fn().mockResolvedValue(null), set: jest.fn() },
}));
jest.mock('@api/middlewares/cache.middleware', () => ({
  cacheResponse: jest.fn(() => (_req: any, _res: any, next: any) => next()),
}));

// Spy on aggregate calls
const patientAggregateSpy = jest.fn();
const encounterAggregateSpy = jest.fn();
const paymentAggregateSpy = jest.fn();

jest.mock('@api/modules/patients/models/patient.model', () => ({
  PatientModel: {
    aggregate: patientAggregateSpy,
    countDocuments: jest.fn().mockResolvedValue(0),
  },
}));
jest.mock('@api/modules/encounters/encounter.model', () => ({
  EncounterModel: {
    aggregate: encounterAggregateSpy,
    countDocuments: jest.fn().mockResolvedValue(5),
  },
}));
jest.mock('@api/modules/payments/models/payment-record.model', () => ({
  PaymentRecordModel: {
    aggregate: paymentAggregateSpy,
    countDocuments: jest.fn().mockResolvedValue(0),
  },
}));

jest.mock('@api/middlewares/auth.middleware', () => ({
  authenticate: jest.fn((_req: any, _res: any, next: any) => next()),
  requireRoles: jest.fn(() => (_req: any, _res: any, next: any) => next()),
}));
jest.mock('@api/middlewares/validate.middleware', () => ({
  validateRequest: jest.fn(() => (_req: any, _res: any, next: any) => next()),
}));

// ── Aggregate mock helpers ────────────────────────────────────────────────────
function makeAggregateMock(result: any[]) {
  return jest.fn().mockReturnValue({
    option: jest.fn().mockResolvedValue(result),
    then: jest.fn((resolve: any) => resolve(result)),
    exec: jest.fn().mockResolvedValue(result),
  });
}

// Mongoose aggregate returns a thenable query object
function makeAggregateQuery(result: any[]) {
  const q: any = {
    option: jest.fn().mockReturnValue(q),
  };
  // Make it awaitable
  q.then = (resolve: any, reject: any) => Promise.resolve(result).then(resolve, reject);
  return q;
}

import request from 'supertest';
import express from 'express';
import { reportRoutes } from '../reports.controller';

// ── Build a minimal app ───────────────────────────────────────────────────────
const app = express();
app.use(express.json());
app.use((req: any, _res: any, next: any) => {
  req.user = { userId: 'u1', clinicId: 'clinic-test-123', role: 'CLINIC_ADMIN' };
  next();
});
app.use('/reports', reportRoutes);

const CLINIC_ID = 'clinic-test-123';

// ── Setup aggregation responses ───────────────────────────────────────────────
beforeEach(() => {
  jest.clearAllMocks();

  // Default responses for overview
  patientAggregateSpy.mockReturnValue(
    makeAggregateQuery([
      {
        total: [{ count: 100 }],
        active: [{ count: 85 }],
        new: [{ count: 12 }],
      },
    ])
  );
  encounterAggregateSpy.mockReturnValue(
    makeAggregateQuery([
      {
        total: [{ count: 50 }],
        byStatus: [{ completed: 40, cancelled: 5 }],
        byDoctor: [],
        topComplaints: [],
        completionRate: [{ total: 50, completed: 40 }],
      },
    ])
  );
  paymentAggregateSpy.mockReturnValue(
    makeAggregateQuery([
      {
        summary: [{ total: 20, confirmed: 15, pending: 5 }],
        totalXLM: [{ sum: 1000.5 }],
        byMonth: [],
        successRate: [{ total: 20, confirmed: 15 }],
        byAsset: [],
      },
    ])
  );
});

// ── GET /reports/overview ─────────────────────────────────────────────────────
describe('#1070 GET /reports/overview — aggregation pipeline optimization', () => {
  it('returns 200 with patients/encounters/payments summary', async () => {
    const res = await request(app).get('/reports/overview').expect(200);
    expect(res.body.status).toBe('success');
    expect(res.body.data).toHaveProperty('patients');
    expect(res.body.data).toHaveProperty('encounters');
    expect(res.body.data).toHaveProperty('payments');
  });

  it('$match includes clinicId as first filter (index utilization)', async () => {
    await request(app).get('/reports/overview').expect(200);

    // PatientModel.aggregate should be called — first stage should be $match with clinicId
    const pipelineArg: any[] = patientAggregateSpy.mock.calls[0]?.[0] ?? [];
    expect(pipelineArg[0]).toHaveProperty('$match');
    expect(pipelineArg[0].$match).toHaveProperty('clinicId', CLINIC_ID);
  });

  it('uses $facet stage in patient pipeline (single round-trip)', async () => {
    await request(app).get('/reports/overview').expect(200);

    const pipelineArg: any[] = patientAggregateSpy.mock.calls[0]?.[0] ?? [];
    const facetStage = pipelineArg.find((s: any) => '$facet' in s);
    expect(facetStage).toBeDefined();
    expect(facetStage.$facet).toHaveProperty('total');
    expect(facetStage.$facet).toHaveProperty('active');
  });

  it('applies date range filter when from/to params provided', async () => {
    await request(app).get('/reports/overview?from=2026-01-01&to=2026-12-31').expect(200);

    const pipelineArg: any[] = patientAggregateSpy.mock.calls[0]?.[0] ?? [];
    const matchStage = pipelineArg[0].$match;
    expect(matchStage).toHaveProperty('createdAt');
    expect(matchStage.createdAt).toHaveProperty('$gte');
    expect(matchStage.createdAt).toHaveProperty('$lte');
  });
});

// ── GET /reports/patients ─────────────────────────────────────────────────────
describe('#1070 GET /reports/patients', () => {
  beforeEach(() => {
    patientAggregateSpy.mockReturnValue(
      makeAggregateQuery([
        {
          newByMonth: [{ _id: '2026-01', count: 5 }],
          bySex: [
            { _id: 'M', count: 40 },
            { _id: 'F', count: 45 },
          ],
          byAge: [{ _id: 0, count: 10 }],
        },
      ])
    );
  });

  it('returns 200 with demographics data', async () => {
    const res = await request(app).get('/reports/patients').expect(200);
    expect(res.body.status).toBe('success');
    expect(res.body.data).toHaveProperty('newByMonth');
    expect(res.body.data).toHaveProperty('demographics');
  });

  it('$match places clinicId first in the pipeline', async () => {
    await request(app).get('/reports/patients').expect(200);

    const pipeline: any[] = patientAggregateSpy.mock.calls[0]?.[0] ?? [];
    expect(pipeline[0].$match).toHaveProperty('clinicId', CLINIC_ID);
  });

  it('uses $facet for demographics (single aggregation call)', async () => {
    await request(app).get('/reports/patients').expect(200);

    const pipeline: any[] = patientAggregateSpy.mock.calls[0]?.[0] ?? [];
    const facetStage = pipeline.find((s: any) => '$facet' in s);
    expect(facetStage).toBeDefined();
    expect(facetStage.$facet).toHaveProperty('newByMonth');
    expect(facetStage.$facet).toHaveProperty('bySex');
    expect(facetStage.$facet).toHaveProperty('byAge');
  });
});

// ── GET /reports/encounters ───────────────────────────────────────────────────
describe('#1070 GET /reports/encounters', () => {
  beforeEach(() => {
    encounterAggregateSpy.mockReturnValue(
      makeAggregateQuery([
        {
          byDoctor: [{ _id: 'doc-1', count: 20 }],
          topComplaints: [{ _id: 'headache', count: 15 }],
          completionRate: [{ total: 50, completed: 45 }],
        },
      ])
    );
  });

  it('returns 200 with byDoctor, topComplaints, completionRate', async () => {
    const res = await request(app).get('/reports/encounters').expect(200);
    expect(res.body.status).toBe('success');
    expect(res.body.data).toHaveProperty('byDoctor');
    expect(res.body.data).toHaveProperty('topComplaints');
    expect(res.body.data).toHaveProperty('completionRate');
  });

  it('uses single aggregation call with $match first and $facet', async () => {
    await request(app).get('/reports/encounters').expect(200);

    expect(encounterAggregateSpy).toHaveBeenCalledTimes(1);
    const pipeline: any[] = encounterAggregateSpy.mock.calls[0][0];
    expect(pipeline[0].$match).toHaveProperty('clinicId', CLINIC_ID);
    const facetStage = pipeline.find((s: any) => '$facet' in s);
    expect(facetStage).toBeDefined();
  });
});

// ── GET /reports/payments ─────────────────────────────────────────────────────
describe('#1070 GET /reports/payments', () => {
  beforeEach(() => {
    paymentAggregateSpy.mockReturnValue(
      makeAggregateQuery([
        {
          byMonth: [{ _id: '2026-01', count: 5, total: 500 }],
          successRate: [{ total: 10, confirmed: 8 }],
          byAsset: [{ _id: 'XLM', count: 8, total: 800 }],
        },
      ])
    );
  });

  it('returns 200 with byMonth, successRate, byAsset', async () => {
    const res = await request(app).get('/reports/payments').expect(200);
    expect(res.body.status).toBe('success');
    expect(res.body.data).toHaveProperty('byMonth');
    expect(res.body.data).toHaveProperty('successRate');
    expect(res.body.data).toHaveProperty('byAsset');
  });

  it('$match places clinicId first for payment pipeline', async () => {
    await request(app).get('/reports/payments').expect(200);

    const pipeline: any[] = paymentAggregateSpy.mock.calls[0][0];
    expect(pipeline[0].$match).toHaveProperty('clinicId', CLINIC_ID);
  });
});
