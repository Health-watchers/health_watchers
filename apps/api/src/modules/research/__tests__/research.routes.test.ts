/**
 * Integration tests for GET /api/v1/research/export — Issue #1427
 *
 * Uses an isolated Express app (no app.ts import) to avoid the
 * @health-watchers/types transitive dependency absent in CI.
 */

// ── Environment stubs ─────────────────────────────────────────────────────────
process.env.JWT_ACCESS_TOKEN_SECRET = 'test-access-secret-32-chars-long!!';
process.env.JWT_REFRESH_TOKEN_SECRET = 'test-refresh-secret-32-chars-long!';

// ── Mocks ─────────────────────────────────────────────────────────────────────
jest.mock('@api/utils/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

jest.mock('@api/services/token-denylist.service', () => ({
  isDenylisted: jest.fn().mockResolvedValue(false),
  isInvalidatedForUser: jest.fn().mockResolvedValue(false),
}));

jest.mock('@health-watchers/config', () => ({
  config: {
    jwt: {
      accessTokenSecret: 'test-access-secret-32-chars-long!!',
      refreshTokenSecret: 'test-refresh-secret-32-chars-long!',
      issuer: 'health-watchers-api',
      audience: 'health-watchers-client',
    },
    fieldEncryptionKey: 'abcdefghijklmnopqrstuvwxyz012345',
  },
}));

// Stub research controller
const mockExportAnonymizedData = jest.fn(async (_req: any, res: any) => {
  res.json({ success: true, data: { rows: [], exportedAt: new Date().toISOString() } });
});

jest.mock('../research.controller', () => ({
  ResearchController: { exportAnonymizedData: mockExportAnonymizedData },
}));

// ── Imports (after mocks) ─────────────────────────────────────────────────────
import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';

const SECRET = 'test-access-secret-32-chars-long!!';
const CLINIC_ID = '507f1f77bcf86cd799439011';
const USER_ID = '507f1f77bcf86cd799439001';

function makeToken(role: string, overrides: Record<string, unknown> = {}) {
  return jwt.sign(
    { userId: USER_ID, role, clinicId: CLINIC_ID, isSuperAdmin: role === 'SUPER_ADMIN',
      jti: `jti-${Date.now()}-${Math.random()}`, ...overrides },
    SECRET,
    { expiresIn: '15m', issuer: 'health-watchers-api', audience: 'health-watchers-client' }
  );
}

function buildApp() {
  const app = express();
  app.use(express.json());
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const researchRouter = require('../research.routes').default;
  app.use('/api/v1/research', researchRouter);
  return app;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('GET /api/v1/research/export', () => {
  let app: express.Application;
  beforeAll(() => { app = buildApp(); });
  beforeEach(() => jest.clearAllMocks());

  it('returns 200 for SUPER_ADMIN with irbApproval=true', async () => {
    const res = await request(app)
      .get('/api/v1/research/export')
      .query({ irbApproval: 'true' })
      .set('Authorization', `Bearer ${makeToken('SUPER_ADMIN')}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(mockExportAnonymizedData).toHaveBeenCalledTimes(1);
  });

  it('returns 401 when no Authorization header is provided', async () => {
    const res = await request(app)
      .get('/api/v1/research/export')
      .query({ irbApproval: 'true' });

    expect(res.status).toBe(401);
    expect(mockExportAnonymizedData).not.toHaveBeenCalled();
  });

  it('returns 403 for DOCTOR role', async () => {
    const res = await request(app)
      .get('/api/v1/research/export')
      .query({ irbApproval: 'true' })
      .set('Authorization', `Bearer ${makeToken('DOCTOR')}`);

    expect(res.status).toBe(403);
    expect(mockExportAnonymizedData).not.toHaveBeenCalled();
  });

  it('returns 403 for CLINIC_ADMIN role', async () => {
    const res = await request(app)
      .get('/api/v1/research/export')
      .query({ irbApproval: 'true' })
      .set('Authorization', `Bearer ${makeToken('CLINIC_ADMIN')}`);

    expect(res.status).toBe(403);
    expect(mockExportAnonymizedData).not.toHaveBeenCalled();
  });

  it('returns 403 for PATIENT role', async () => {
    const res = await request(app)
      .get('/api/v1/research/export')
      .query({ irbApproval: 'true' })
      .set('Authorization', `Bearer ${makeToken('PATIENT')}`);

    expect(res.status).toBe(403);
    expect(mockExportAnonymizedData).not.toHaveBeenCalled();
  });

  it('returns 401 for an expired token', async () => {
    const expired = jwt.sign(
      { userId: USER_ID, role: 'SUPER_ADMIN', clinicId: CLINIC_ID, isSuperAdmin: true, jti: 'exp' },
      SECRET,
      { expiresIn: '-1s', issuer: 'health-watchers-api', audience: 'health-watchers-client' }
    );
    const res = await request(app)
      .get('/api/v1/research/export')
      .query({ irbApproval: 'true' })
      .set('Authorization', `Bearer ${expired}`);

    expect(res.status).toBe(401);
    expect(mockExportAnonymizedData).not.toHaveBeenCalled();
  });

  it('forwards query params to the controller', async () => {
    await request(app)
      .get('/api/v1/research/export')
      .query({ irbApproval: 'true', includeEncounters: 'true' })
      .set('Authorization', `Bearer ${makeToken('SUPER_ADMIN')}`);

    expect(mockExportAnonymizedData).toHaveBeenCalledTimes(1);
    const [req] = mockExportAnonymizedData.mock.calls[0];
    expect(req.query.includeEncounters).toBe('true');
  });
});
