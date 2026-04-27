/**
 * Integration tests for the payments module.
 *
 * Uses MongoDB Memory Server for a real in-process database and mocks the
 * stellar-service HTTP client so no real network calls are made.
 *
 * Builds a minimal Express app mounting only the payments routes to avoid
 * pulling in unrelated modules with pre-existing issues.
 */

// ── Env stubs (before any module that reads process.env) ─────────────────────
process.env.MONGO_URI = 'mongodb://localhost:27017/test';
process.env.JWT_ACCESS_TOKEN_SECRET = 'test-access-secret-32-chars-long!!';
process.env.JWT_REFRESH_TOKEN_SECRET = 'test-refresh-secret-32-chars-long!';
process.env.API_PORT = '3001';
process.env.NODE_ENV = 'test';
process.env.STELLAR_NETWORK = 'testnet';

// ── Module mocks (before imports) ─────────────────────────────────────────────

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
    stellarNetwork: 'testnet',
    stellar: { network: 'testnet', horizonUrl: '', secretKey: '', platformPublicKey: 'GPLATFORM' },
    supportedAssets: ['XLM', 'USDC'],
    stellarServiceUrl: 'http://stellar-service:3002',
    geminiApiKey: '',
    fieldEncryptionKey: 'abcdefghijklmnopqrstuvwxyz012345',
  },
}));

jest.mock('@api/utils/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));
jest.mock('@api/lib/email.service', () => ({ sendPaymentConfirmationEmail: jest.fn() }));
jest.mock('@api/realtime/socket', () => ({ emitToClinic: jest.fn() }));
jest.mock('@api/services/metrics.service', () => ({
  paymentsInitiatedTotal: { inc: jest.fn() },
  paymentsConfirmedTotal: { inc: jest.fn() },
}));
jest.mock('@api/utils/tracer', () => ({
  withSpan: jest.fn((_name: string, _attrs: unknown, fn: () => unknown) => fn()),
}));
jest.mock('@api/middlewares/fee-budget-check.middleware', () => ({
  feeBudgetCheck: (_req: unknown, _res: unknown, next: () => void) => next(),
}));

// ── Stellar service mock ───────────────────────────────────────────────────────
jest.mock('@api/modules/payments/services/stellar-client', () => ({
  stellarClient: {
    verifyTransaction: jest.fn(),
    getBalance: jest.fn(),
    getFeeEstimate: jest.fn(),
    findPaths: jest.fn(),
    getOrderbook: jest.fn(),
    fundAccount: jest.fn(),
    createUsdcTrustline: jest.fn(),
    sponsorFeeBump: jest.fn(),
  },
}));

// ── Imports ───────────────────────────────────────────────────────────────────
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { PaymentRecordModel } from '../models/payment-record.model';
import { stellarClient } from '../services/stellar-client';
import { authenticate } from '@api/middlewares/auth.middleware';
import { paymentRoutes } from '../payments.controller';
import { paymentExportRoutes } from '../payments.export.controller';

// ── Minimal test app ──────────────────────────────────────────────────────────
function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/v1/payments', paymentExportRoutes);
  app.use('/api/v1/payments', paymentRoutes);
  return app;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const SECRET = 'test-access-secret-32-chars-long!!';

function makeToken(clinicId: string, role = 'CLINIC_ADMIN'): string {
  return jwt.sign({ userId: new mongoose.Types.ObjectId().toString(), role, clinicId }, SECRET, {
    expiresIn: '15m',
    issuer: 'health-watchers-api',
    audience: 'health-watchers-client',
  });
}

const CLINIC_A = 'clinic-aaa';
const CLINIC_B = 'clinic-bbb';
const DESTINATION = 'GDESTINATION123456789012345678901234567890123456';

function validTx(
  overrides: Partial<{
    to: string;
    amount: string;
    asset: string;
    memo: string;
  }> = {}
) {
  return {
    found: true,
    transaction: {
      hash: 'valid-tx-hash',
      from: 'GFROM',
      to: overrides.to ?? DESTINATION,
      amount: overrides.amount ?? '10.0000000',
      asset: overrides.asset ?? 'XLM',
      memo: overrides.memo ?? '',
      timestamp: new Date().toISOString(),
      success: true,
    },
  };
}

// ── MongoDB Memory Server lifecycle ──────────────────────────────────────────
let mongod: MongoMemoryServer;
let app: express.Express;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  app = buildApp();
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

afterEach(async () => {
  await PaymentRecordModel.deleteMany({});
  jest.clearAllMocks();
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/v1/payments/intent
// ─────────────────────────────────────────────────────────────────────────────
describe('POST /api/v1/payments/intent', () => {
  const token = makeToken(CLINIC_A);

  it('returns 201 with intent details for valid request', async () => {
    const res = await request(app)
      .post('/api/v1/payments/intent')
      .set('Authorization', `Bearer ${token}`)
      .send({ amount: '10.00', destination: DESTINATION });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe('success');
    expect(res.body.data.intentId).toBeDefined();
    expect(res.body.data.status).toBe('pending');
    expect(res.body.data.amount).toBe('10.00');
  });

  it('returns 400 for missing amount', async () => {
    const res = await request(app)
      .post('/api/v1/payments/intent')
      .set('Authorization', `Bearer ${token}`)
      .send({ destination: DESTINATION });

    expect(res.status).toBe(400);
  });

  it('returns 401 without authentication', async () => {
    const res = await request(app)
      .post('/api/v1/payments/intent')
      .send({ amount: '10.00', destination: DESTINATION });

    expect(res.status).toBe(401);
  });

  it('sets clinicId from JWT, not request body', async () => {
    const res = await request(app)
      .post('/api/v1/payments/intent')
      .set('Authorization', `Bearer ${token}`)
      .send({ amount: '5.00', destination: DESTINATION, clinicId: 'injected-clinic' });

    expect(res.status).toBe(201);
    const record = await PaymentRecordModel.findOne({ intentId: res.body.data.intentId });
    expect(record?.clinicId).toBe(CLINIC_A);
    expect(record?.clinicId).not.toBe('injected-clinic');
  });

  it('intentId is a valid UUID', async () => {
    const res = await request(app)
      .post('/api/v1/payments/intent')
      .set('Authorization', `Bearer ${token}`)
      .send({ amount: '10.00', destination: DESTINATION });

    expect(res.status).toBe(201);
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    expect(res.body.data.intentId).toMatch(uuidRegex);
  });

  it("memo format is 'HW:{8chars}'", async () => {
    const res = await request(app)
      .post('/api/v1/payments/intent')
      .set('Authorization', `Bearer ${token}`)
      .send({ amount: '10.00', destination: DESTINATION });

    expect(res.status).toBe(201);
    expect(res.body.data.memo).toMatch(/^HW:[A-F0-9]{8}$/);
  });

  it("creates PaymentRecord with status 'pending'", async () => {
    const res = await request(app)
      .post('/api/v1/payments/intent')
      .set('Authorization', `Bearer ${token}`)
      .send({ amount: '10.00', destination: DESTINATION });

    expect(res.status).toBe(201);
    const record = await PaymentRecordModel.findOne({ intentId: res.body.data.intentId });
    expect(record).not.toBeNull();
    expect(record?.status).toBe('pending');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/v1/payments  (status lookup via list endpoint)
// ─────────────────────────────────────────────────────────────────────────────
describe('GET /api/v1/payments (status lookup)', () => {
  const tokenA = makeToken(CLINIC_A);
  const tokenB = makeToken(CLINIC_B);

  it('returns payment status for own clinic', async () => {
    const intentRes = await request(app)
      .post('/api/v1/payments/intent')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ amount: '10.00', destination: DESTINATION });
    expect(intentRes.status).toBe(201);

    const listRes = await request(app)
      .get('/api/v1/payments')
      .set('Authorization', `Bearer ${tokenA}`);

    expect(listRes.status).toBe(200);
    expect(listRes.body.data.length).toBeGreaterThan(0);
    expect(listRes.body.data[0].intentId).toBe(intentRes.body.data.intentId);
  });

  it('returns 401 without authentication', async () => {
    const res = await request(app).get('/api/v1/payments');
    expect(res.status).toBe(401);
  });

  it('returns 404 for intentId from another clinic (cross-tenant lookup)', async () => {
    // Clinic A creates an intent
    const intentRes = await request(app)
      .post('/api/v1/payments/intent')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ amount: '10.00', destination: DESTINATION });
    expect(intentRes.status).toBe(201);

    // Clinic B tries to confirm it — should get 404
    const res = await request(app)
      .patch(`/api/v1/payments/${intentRes.body.data.intentId}/confirm`)
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ txHash: 'some-tx' });

    expect(res.status).toBe(404);
  });

  it('clinic B cannot see clinic A payment intents', async () => {
    await request(app)
      .post('/api/v1/payments/intent')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ amount: '10.00', destination: DESTINATION });

    const res = await request(app).get('/api/v1/payments').set('Authorization', `Bearer ${tokenB}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/v1/payments/:intentId/confirm
// ─────────────────────────────────────────────────────────────────────────────
describe('PATCH /api/v1/payments/:intentId/confirm', () => {
  const tokenA = makeToken(CLINIC_A);
  const tokenB = makeToken(CLINIC_B);

  async function createIntent(token: string, amount = '10.0000000', dest = DESTINATION) {
    const res = await request(app)
      .post('/api/v1/payments/intent')
      .set('Authorization', `Bearer ${token}`)
      .send({ amount, destination: dest });
    expect(res.status).toBe(201);
    return res.body.data as { intentId: string; memo: string };
  }

  it('returns 200 for valid txHash matching intent', async () => {
    const intent = await createIntent(tokenA);
    (stellarClient.verifyTransaction as jest.Mock).mockResolvedValue(
      validTx({ memo: intent.memo })
    );

    const res = await request(app)
      .patch(`/api/v1/payments/${intent.intentId}/confirm`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ txHash: 'valid-tx-hash' });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('success');
    expect(res.body.data.status).toBe('confirmed');
  });

  it("updates PaymentRecord status to 'confirmed'", async () => {
    const intent = await createIntent(tokenA);
    (stellarClient.verifyTransaction as jest.Mock).mockResolvedValue(
      validTx({ memo: intent.memo })
    );

    await request(app)
      .patch(`/api/v1/payments/${intent.intentId}/confirm`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ txHash: 'valid-tx-hash' });

    const record = await PaymentRecordModel.findOne({ intentId: intent.intentId });
    expect(record?.status).toBe('confirmed');
  });

  it('sets txHash and confirmedAt on PaymentRecord', async () => {
    const intent = await createIntent(tokenA);
    (stellarClient.verifyTransaction as jest.Mock).mockResolvedValue(
      validTx({ memo: intent.memo })
    );

    await request(app)
      .patch(`/api/v1/payments/${intent.intentId}/confirm`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ txHash: 'valid-tx-hash' });

    const record = await PaymentRecordModel.findOne({ intentId: intent.intentId });
    expect(record?.txHash).toBe('valid-tx-hash');
    expect(record?.confirmedAt).toBeDefined();
  });

  it('returns 400 for txHash not found on Stellar', async () => {
    const intent = await createIntent(tokenA);
    (stellarClient.verifyTransaction as jest.Mock).mockResolvedValue({
      found: false,
      error: 'Transaction not found',
    });

    const res = await request(app)
      .patch(`/api/v1/payments/${intent.intentId}/confirm`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ txHash: 'bad-tx-hash' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('TransactionNotFound');
  });

  it('returns 400 for amount mismatch', async () => {
    const intent = await createIntent(tokenA, '10.0000000');
    (stellarClient.verifyTransaction as jest.Mock).mockResolvedValue(
      validTx({ amount: '99.0000000', memo: intent.memo })
    );

    const res = await request(app)
      .patch(`/api/v1/payments/${intent.intentId}/confirm`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ txHash: 'valid-tx-hash' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('AmountMismatch');
  });

  it('returns 400 for destination mismatch', async () => {
    const intent = await createIntent(tokenA);
    (stellarClient.verifyTransaction as jest.Mock).mockResolvedValue(
      validTx({ to: 'GWRONG_DESTINATION', memo: intent.memo })
    );

    const res = await request(app)
      .patch(`/api/v1/payments/${intent.intentId}/confirm`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ txHash: 'valid-tx-hash' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('DestinationMismatch');
  });

  it('returns 409 for already-confirmed payment', async () => {
    const intent = await createIntent(tokenA);
    (stellarClient.verifyTransaction as jest.Mock).mockResolvedValue(
      validTx({ memo: intent.memo })
    );

    // First confirmation
    await request(app)
      .patch(`/api/v1/payments/${intent.intentId}/confirm`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ txHash: 'valid-tx-hash' });

    // Second confirmation attempt
    const res = await request(app)
      .patch(`/api/v1/payments/${intent.intentId}/confirm`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ txHash: 'valid-tx-hash' });

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('AlreadyConfirmed');
  });

  it('returns 401 without authentication', async () => {
    const res = await request(app)
      .patch('/api/v1/payments/some-intent/confirm')
      .send({ txHash: 'tx' });

    expect(res.status).toBe(401);
  });

  it('returns 404 for non-existent intentId', async () => {
    const res = await request(app)
      .patch('/api/v1/payments/non-existent-intent/confirm')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ txHash: 'valid-tx-hash' });

    expect(res.status).toBe(404);
  });

  it('clinic B cannot confirm clinic A transaction (multi-tenant isolation)', async () => {
    const intent = await createIntent(tokenA);
    (stellarClient.verifyTransaction as jest.Mock).mockResolvedValue(
      validTx({ memo: intent.memo })
    );

    const res = await request(app)
      .patch(`/api/v1/payments/${intent.intentId}/confirm`)
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ txHash: 'valid-tx-hash' });

    expect(res.status).toBe(404);
    // Verify the record is still pending
    const record = await PaymentRecordModel.findOne({ intentId: intent.intentId });
    expect(record?.status).toBe('pending');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Stellar service mock scenarios
// ─────────────────────────────────────────────────────────────────────────────
describe('Stellar service mock scenarios', () => {
  const token = makeToken(CLINIC_A);

  async function createIntent() {
    const res = await request(app)
      .post('/api/v1/payments/intent')
      .set('Authorization', `Bearer ${token}`)
      .send({ amount: '10.0000000', destination: DESTINATION });
    return res.body.data as { intentId: string; memo: string };
  }

  it('simulates network timeout — returns 400 TransactionNotFound', async () => {
    const intent = await createIntent();
    (stellarClient.verifyTransaction as jest.Mock).mockResolvedValue({
      found: false,
      error: 'Request failed: timeout of 10000ms exceeded',
    });

    const res = await request(app)
      .patch(`/api/v1/payments/${intent.intentId}/confirm`)
      .set('Authorization', `Bearer ${token}`)
      .send({ txHash: 'timeout-tx' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('TransactionNotFound');
  });

  it('simulates invalid transaction — returns 400 TransactionNotFound', async () => {
    const intent = await createIntent();
    (stellarClient.verifyTransaction as jest.Mock).mockResolvedValue({
      found: false,
      error: 'Transaction is invalid',
    });

    const res = await request(app)
      .patch(`/api/v1/payments/${intent.intentId}/confirm`)
      .set('Authorization', `Bearer ${token}`)
      .send({ txHash: 'invalid-tx' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('TransactionNotFound');
  });

  it('no real HTTP calls are made to stellar-service', async () => {
    const intent = await createIntent();
    (stellarClient.verifyTransaction as jest.Mock).mockResolvedValue(
      validTx({ memo: intent.memo })
    );

    await request(app)
      .patch(`/api/v1/payments/${intent.intentId}/confirm`)
      .set('Authorization', `Bearer ${token}`)
      .send({ txHash: 'valid-tx-hash' });

    expect(stellarClient.verifyTransaction).toHaveBeenCalledWith('valid-tx-hash');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Full payment lifecycle: intent → confirm
// ─────────────────────────────────────────────────────────────────────────────
describe('Full payment lifecycle (intent → confirm)', () => {
  const token = makeToken(CLINIC_A);

  it('completes the full lifecycle end-to-end', async () => {
    // 1. Create intent
    const intentRes = await request(app)
      .post('/api/v1/payments/intent')
      .set('Authorization', `Bearer ${token}`)
      .send({ amount: '25.0000000', destination: DESTINATION });

    expect(intentRes.status).toBe(201);
    const { intentId, memo } = intentRes.body.data;

    // 2. Verify record is pending in DB
    const pending = await PaymentRecordModel.findOne({ intentId });
    expect(pending?.status).toBe('pending');

    // 3. Confirm with matching Stellar transaction
    (stellarClient.verifyTransaction as jest.Mock).mockResolvedValue(
      validTx({ amount: '25.0000000', memo })
    );

    const confirmRes = await request(app)
      .patch(`/api/v1/payments/${intentId}/confirm`)
      .set('Authorization', `Bearer ${token}`)
      .send({ txHash: 'lifecycle-tx-hash' });

    expect(confirmRes.status).toBe(200);
    expect(confirmRes.body.data.status).toBe('confirmed');
    expect(confirmRes.body.data.txHash).toBe('lifecycle-tx-hash');

    // 4. Verify final DB state
    const confirmed = await PaymentRecordModel.findOne({ intentId });
    expect(confirmed?.status).toBe('confirmed');
    expect(confirmed?.txHash).toBe('lifecycle-tx-hash');
    expect(confirmed?.confirmedAt).toBeDefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Multi-tenant isolation
// ─────────────────────────────────────────────────────────────────────────────
describe('Multi-tenant isolation', () => {
  const tokenA = makeToken(CLINIC_A);
  const tokenB = makeToken(CLINIC_B);

  it('clinic A cannot access clinic B payment intents via list', async () => {
    await request(app)
      .post('/api/v1/payments/intent')
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ amount: '50.00', destination: DESTINATION });

    const res = await request(app).get('/api/v1/payments').set('Authorization', `Bearer ${tokenA}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(0);
  });

  it('clinic A cannot confirm clinic B transactions', async () => {
    const intentRes = await request(app)
      .post('/api/v1/payments/intent')
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ amount: '50.00', destination: DESTINATION });

    const { intentId, memo } = intentRes.body.data;
    (stellarClient.verifyTransaction as jest.Mock).mockResolvedValue(
      validTx({ amount: '50.00', memo })
    );

    const res = await request(app)
      .patch(`/api/v1/payments/${intentId}/confirm`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ txHash: 'some-tx' });

    expect(res.status).toBe(404);

    const record = await PaymentRecordModel.findOne({ intentId });
    expect(record?.status).toBe('pending');
  });
});
