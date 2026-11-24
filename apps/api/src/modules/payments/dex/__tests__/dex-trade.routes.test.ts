/**
 * Integration tests for DEX trade routes — Issue #1427
 *
 * Routes under test:
 *   POST /api/v1/payments/dex/trade
 *   GET  /api/v1/payments/dex/history
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

// rate-limit.middleware is auto-mocked via jest.config moduleNameMapper:
//   @api/middlewares/rate-limit.middleware → src/__mocks__/rate-limit.middleware.ts
// No explicit mock needed here.

// Stub dex-trade controller
const mockSubmitDexTrade = jest.fn(async (_req: any, res: any) => {
  res.status(202).json({ success: true, message: 'Trade submitted', data: {} });
});
const mockGetTradeHistory = jest.fn(async (_req: any, res: any) => {
  res.json({ success: true, data: [] });
});

jest.mock('../dex-trade.controller', () => ({
  submitDexTrade: mockSubmitDexTrade,
  getTradeHistory: mockGetTradeHistory,
}));

// ── Imports ───────────────────────────────────────────────────────────────────
import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';

const SECRET = 'test-access-secret-32-chars-long!!';
const CLINIC_ID = '507f1f77bcf86cd799439011';
const USER_ID = '507f1f77bcf86cd799439001';

function makeToken(role: string) {
  return jwt.sign(
    { userId: USER_ID, role, clinicId: CLINIC_ID, jti: `jti-${Date.now()}-${Math.random()}` },
    SECRET,
    { expiresIn: '15m', issuer: 'health-watchers-api', audience: 'health-watchers-client' }
  );
}

function buildApp() {
  const app = express();
  app.use(express.json());
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const dexTradeRouter = require('../dex-trade.routes').default;
  app.use('/api/v1/payments/dex', dexTradeRouter);
  return app;
}

const tradeBody = {
  sellAsset: 'XLM',
  buyAsset: 'USDC',
  sellAmount: 100,
  expectedPrice: 0.12,
  maxSlippagePercent: 1,
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('POST /api/v1/payments/dex/trade', () => {
  let app: express.Application;
  beforeAll(() => { app = buildApp(); });
  beforeEach(() => jest.clearAllMocks());

  it('returns 202 for CLINIC_ADMIN', async () => {
    const res = await request(app)
      .post('/api/v1/payments/dex/trade')
      .set('Authorization', `Bearer ${makeToken('CLINIC_ADMIN')}`)
      .send(tradeBody);

    expect(res.status).toBe(202);
    expect(res.body.success).toBe(true);
    expect(mockSubmitDexTrade).toHaveBeenCalledTimes(1);
  });

  it('returns 403 for DOCTOR role', async () => {
    const res = await request(app)
      .post('/api/v1/payments/dex/trade')
      .set('Authorization', `Bearer ${makeToken('DOCTOR')}`)
      .send(tradeBody);

    expect(res.status).toBe(403);
    expect(mockSubmitDexTrade).not.toHaveBeenCalled();
  });

  it('returns 403 for PATIENT role', async () => {
    const res = await request(app)
      .post('/api/v1/payments/dex/trade')
      .set('Authorization', `Bearer ${makeToken('PATIENT')}`)
      .send(tradeBody);

    expect(res.status).toBe(403);
    expect(mockSubmitDexTrade).not.toHaveBeenCalled();
  });

  it('returns 401 when no token is provided', async () => {
    const res = await request(app).post('/api/v1/payments/dex/trade').send(tradeBody);
    expect(res.status).toBe(401);
    expect(mockSubmitDexTrade).not.toHaveBeenCalled();
  });

  it('returns 401 for an expired token', async () => {
    const expired = jwt.sign(
      { userId: USER_ID, role: 'CLINIC_ADMIN', clinicId: CLINIC_ID, jti: 'exp' },
      SECRET,
      { expiresIn: '-1s', issuer: 'health-watchers-api', audience: 'health-watchers-client' }
    );
    const res = await request(app)
      .post('/api/v1/payments/dex/trade')
      .set('Authorization', `Bearer ${expired}`)
      .send(tradeBody);

    expect(res.status).toBe(401);
    expect(mockSubmitDexTrade).not.toHaveBeenCalled();
  });
});

describe('GET /api/v1/payments/dex/history', () => {
  let app: express.Application;
  beforeAll(() => { app = buildApp(); });
  beforeEach(() => jest.clearAllMocks());

  it('returns 200 for CLINIC_ADMIN', async () => {
    const res = await request(app)
      .get('/api/v1/payments/dex/history')
      .set('Authorization', `Bearer ${makeToken('CLINIC_ADMIN')}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(mockGetTradeHistory).toHaveBeenCalledTimes(1);
  });

  it('returns 200 for DOCTOR', async () => {
    const res = await request(app)
      .get('/api/v1/payments/dex/history')
      .set('Authorization', `Bearer ${makeToken('DOCTOR')}`);

    expect(res.status).toBe(200);
    expect(mockGetTradeHistory).toHaveBeenCalledTimes(1);
  });

  it('returns 401 when no token is provided', async () => {
    const res = await request(app).get('/api/v1/payments/dex/history');
    expect(res.status).toBe(401);
    expect(mockGetTradeHistory).not.toHaveBeenCalled();
  });

  it('returns 403 for PATIENT role', async () => {
    const res = await request(app)
      .get('/api/v1/payments/dex/history')
      .set('Authorization', `Bearer ${makeToken('PATIENT')}`);

    expect(res.status).toBe(403);
    expect(mockGetTradeHistory).not.toHaveBeenCalled();
  });
});
