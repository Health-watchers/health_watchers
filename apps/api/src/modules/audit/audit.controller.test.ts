/**
 * Tests for audit log search, filtering, CSV export, and summary endpoint.
 * Issue #643
 */

import request from 'supertest';
import express from 'express';
import { auditRoutes } from './audit.controller';
import { AuditLogModel } from './audit.model';

// ── Mocks ─────────────────────────────────────────────────────────────────────

jest.mock('./audit.model', () => ({
  AuditLogModel: {
    find: jest.fn(),
    countDocuments: jest.fn(),
    aggregate: jest.fn(),
  },
}));

jest.mock('../../middlewares/auth.middleware', () => ({
  authenticate: (req: any, _res: any, next: any) => {
    req.user = { role: 'SUPER_ADMIN', userId: 'user-1', clinicId: 'clinic-1' };
    next();
  },
}));

jest.mock('../../utils/logger', () => ({
  __esModule: true,
  default: { error: jest.fn(), warn: jest.fn(), info: jest.fn() },
}));

// ── App setup ─────────────────────────────────────────────────────────────────

const app = express();
app.use(express.json());
app.use('/audit-logs', auditRoutes);

// ── Helpers ───────────────────────────────────────────────────────────────────

const mockFind = AuditLogModel.find as jest.Mock;
const mockCount = AuditLogModel.countDocuments as jest.Mock;
const mockAggregate = AuditLogModel.aggregate as jest.Mock;

function chainableMock(docs: any[]) {
  const chain: any = {
    sort: () => chain,
    skip: () => chain,
    limit: () => chain,
    populate: () => chain,
    lean: () => Promise.resolve(docs),
  };
  return chain;
}

const sampleLog = {
  _id: '64a000000000000000000001',
  action: 'PATIENT_VIEW',
  outcome: 'SUCCESS',
  timestamp: new Date('2024-01-15T10:00:00Z'),
  userId: 'user-1',
  clinicId: 'clinic-1',
  resourceType: 'Patient',
  resourceId: 'patient-1',
  ipAddress: '192.168.1.1',
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('GET /audit-logs', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns 403 for non-SUPER_ADMIN', async () => {
    // Override auth middleware for this test
    const restrictedApp = express();
    restrictedApp.use(express.json());
    restrictedApp.use('/audit-logs', (req: any, _res: any, next: any) => {
      req.user = { role: 'CLINIC_ADMIN' };
      next();
    }, auditRoutes);

    const res = await request(restrictedApp).get('/audit-logs');
    expect(res.status).toBe(403);
  });

  it('returns paginated logs with default params', async () => {
    mockFind.mockReturnValue(chainableMock([sampleLog]));
    mockCount.mockResolvedValue(1);

    const res = await request(app).get('/audit-logs');

    expect(res.status).toBe(200);
    expect(res.body.data.logs).toHaveLength(1);
    expect(res.body.data.pagination.total).toBe(1);
  });

  it('filters by userId', async () => {
    mockFind.mockReturnValue(chainableMock([sampleLog]));
    mockCount.mockResolvedValue(1);

    await request(app).get('/audit-logs?userId=64a000000000000000000001');

    const filterArg = mockFind.mock.calls[0][0];
    expect(filterArg.userId).toBeDefined();
  });

  it('filters by action', async () => {
    mockFind.mockReturnValue(chainableMock([]));
    mockCount.mockResolvedValue(0);

    await request(app).get('/audit-logs?action=LOGIN_FAILURE');

    const filterArg = mockFind.mock.calls[0][0];
    expect(filterArg.action).toBe('LOGIN_FAILURE');
  });

  it('filters by outcome', async () => {
    mockFind.mockReturnValue(chainableMock([]));
    mockCount.mockResolvedValue(0);

    await request(app).get('/audit-logs?outcome=FAILURE');

    const filterArg = mockFind.mock.calls[0][0];
    expect(filterArg.outcome).toBe('FAILURE');
  });

  it('filters by date range', async () => {
    mockFind.mockReturnValue(chainableMock([]));
    mockCount.mockResolvedValue(0);

    await request(app).get('/audit-logs?dateFrom=2024-01-01&dateTo=2024-01-31');

    const filterArg = mockFind.mock.calls[0][0];
    expect(filterArg.timestamp.$gte).toEqual(new Date('2024-01-01'));
    expect(filterArg.timestamp.$lte).toEqual(new Date('2024-01-31'));
  });

  it('filters by ipAddress', async () => {
    mockFind.mockReturnValue(chainableMock([]));
    mockCount.mockResolvedValue(0);

    await request(app).get('/audit-logs?ipAddress=192.168.1.1');

    const filterArg = mockFind.mock.calls[0][0];
    expect(filterArg.ipAddress).toBe('192.168.1.1');
  });

  it('filters by resourceType and resourceId', async () => {
    mockFind.mockReturnValue(chainableMock([]));
    mockCount.mockResolvedValue(0);

    await request(app).get('/audit-logs?resourceType=Patient&resourceId=patient-1');

    const filterArg = mockFind.mock.calls[0][0];
    expect(filterArg.resourceType).toBe('Patient');
    expect(filterArg.resourceId).toBe('patient-1');
  });

  it('applies full-text search when q is provided', async () => {
    mockFind.mockReturnValue(chainableMock([]));
    mockCount.mockResolvedValue(0);

    await request(app).get('/audit-logs?q=PATIENT');

    const filterArg = mockFind.mock.calls[0][0];
    expect(filterArg.$text).toEqual({ $search: 'PATIENT' });
  });

  it('returns nextCursor when results fill the page', async () => {
    const logs = Array.from({ length: 50 }, (_, i) => ({
      ...sampleLog,
      _id: `64a00000000000000000000${i}`,
    }));
    mockFind.mockReturnValue(chainableMock(logs));
    mockCount.mockResolvedValue(200);

    const res = await request(app).get('/audit-logs?limit=50');

    expect(res.body.data.pagination.nextCursor).not.toBeNull();
  });

  it('returns 400 for invalid cursor', async () => {
    const res = await request(app).get('/audit-logs?cursor=not-valid-base64-json');
    expect(res.status).toBe(400);
  });

  it('sorts ascending when sort=asc', async () => {
    mockFind.mockReturnValue(chainableMock([]));
    mockCount.mockResolvedValue(0);

    const chain = chainableMock([]);
    const sortSpy = jest.fn().mockReturnValue(chain);
    chain.sort = sortSpy;
    mockFind.mockReturnValue(chain);

    await request(app).get('/audit-logs?sort=asc');

    expect(sortSpy).toHaveBeenCalledWith({ timestamp: 1, _id: 1 });
  });
});

describe('GET /audit-logs/summary', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns action counts', async () => {
    mockAggregate.mockResolvedValue([
      { _id: 'PATIENT_VIEW', count: 42 },
      { _id: 'LOGIN_SUCCESS', count: 10 },
    ]);

    const res = await request(app).get('/audit-logs/summary');

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([
      { action: 'PATIENT_VIEW', count: 42 },
      { action: 'LOGIN_SUCCESS', count: 10 },
    ]);
  });

  it('filters summary by dateFrom/dateTo', async () => {
    mockAggregate.mockResolvedValue([]);

    await request(app).get('/audit-logs/summary?dateFrom=2024-01-01&dateTo=2024-01-31');

    const pipeline = mockAggregate.mock.calls[0][0];
    expect(pipeline[0].$match.timestamp).toBeDefined();
  });
});

describe('GET /audit-logs/export', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns CSV with correct headers', async () => {
    const chain: any = {
      sort: () => chain,
      limit: () => chain,
      lean: () => Promise.resolve([sampleLog]),
    };
    mockFind.mockReturnValue(chain);

    const res = await request(app).get('/audit-logs/export');

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/csv/);
    expect(res.headers['content-disposition']).toMatch(/attachment/);
    expect(res.text).toContain('timestamp,action,outcome');
    expect(res.text).toContain('PATIENT_VIEW');
  });

  it('escapes commas and quotes in CSV values', async () => {
    const logWithComma = {
      ...sampleLog,
      userAgent: 'Mozilla/5.0 (Windows, NT)',
    };
    const chain: any = {
      sort: () => chain,
      limit: () => chain,
      lean: () => Promise.resolve([logWithComma]),
    };
    mockFind.mockReturnValue(chain);

    const res = await request(app).get('/audit-logs/export');

    expect(res.text).toContain('"Mozilla/5.0 (Windows, NT)"');
  });

  it('filters export by action', async () => {
    const chain: any = {
      sort: () => chain,
      limit: () => chain,
      lean: () => Promise.resolve([]),
    };
    mockFind.mockReturnValue(chain);

    await request(app).get('/audit-logs/export?action=LOGIN_FAILURE');

    const filterArg = mockFind.mock.calls[0][0];
    expect(filterArg.action).toBe('LOGIN_FAILURE');
  });
});
