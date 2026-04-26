/**
 * Integration tests for the payments module.
 *
 * Uses MongoDB Memory Server — no real MongoDB or Stellar network calls.
 * Stellar service HTTP calls are mocked via jest.mock.
 */

// ── env must be set before any module import ──────────────────────────────────
process.env.NODE_ENV = 'test';
process.env.JWT_ACCESS_TOKEN_SECRET = 'test-access-secret-32-chars-long!!';
process.env.JWT_REFRESH_TOKEN_SECRET = 'test-refresh-secret-32-chars-long!';
process.env.API_PORT = '3001';

// ── module mocks ──────────────────────────────────────────────────────────────

// Must be before app import — tracing.ts uses OpenTelemetry which breaks under ts-jest
jest.mock('@api/tracing', () => ({}));
jest.mock('../../tracing', () => ({}));

// Mock rate limiters — they use Redis which isn't available in tests
jest.mock('@api/middlewares/rate-limit.middleware', () => {
  const pass = (_req: any, _res: any, next: any) => next();
  return {
    authLimiter: pass,
    forgotPasswordLimiter: pass,
    aiLimiter: pass,
    paymentLimiter: pass,
    generalLimiter: pass,
  };
});

// Stub broken/heavy modules that app.ts imports
jest.mock('@api/modules/patients/patients.controller', () => ({
  patientRoutes: require('express').Router(),
}));
jest.mock('@api/modules/encounters/encounters.controller', () => ({
  encounterRoutes: require('express').Router(),
}));
jest.mock('@api/modules/users/users.controller', () => ({
  userRoutes: require('express').Router(),
}));
jest.mock('@api/modules/users/user-management.controller', () => ({
  userManagementRoutes: require('express').Router(),
}));
jest.mock('@api/modules/cds/cds.controller', () => {
  const router = require('express').Router();
  return { __esModule: true, default: router, cdsRoutes: router };
});
jest.mock('@api/modules/cds/cds-seed', () => ({
  seedBuiltInRules: jest.fn().mockResolvedValue(undefined),
}));

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
    stellarServiceUrl: 'http://stellar-service:3002',
    stellar: {
      network: 'testnet',
      horizonUrl: '',
      secretKey: '',
      platformPublicKey: 'GPLATFORM000000000000000000000000000000000000000000000000',
      usdcIssuer: '',
    },
    supportedAssets: ['XLM', 'USDC'],
    geminiApiKey: '',
    fieldEncryptionKey: '',
  },
}));

// Mock stellar-client so no real HTTP calls are made
jest.mock('@api/modules/payments/services/stellar-client', () => ({
  stellarClient: {
    verifyTransaction: jest.fn(),
    getFeeEstimate: jest.fn(),
    getBalance: jest.fn(),
    fundAccount: jest.fn(),
    findPaths: jest.fn(),
    getOrderbook: jest.fn(),
    sponsorFeeBump: jest.fn(),
  },
}));

// Stub non-payment routes so app.ts doesn't fail to import them
jest.mock('@api/config/db', () => ({ connectDB: jest.fn() }));
jest.mock('@api/docs/swagger', () => ({ setupSwagger: jest.fn() }));
jest.mock('@api/modules/payments/services/payment-expiration-job', () => ({
  startPaymentExpirationJob: jest.fn(),
  stopPaymentExpirationJob: jest.fn(),
}));
jest.mock('@api/modules/payments/services/reconciliation-job', () => ({
  startReconciliationJob: jest.fn(),
  stopReconciliationJob: jest.fn(),
}));
jest.mock('@api/modules/patients/risk-recalculation-job', () => ({
  startRiskRecalculationJob: jest.fn(),
  stopRiskRecalculationJob: jest.fn(),
}));
jest.mock('@api/modules/payments/services/balance-monitoring-job', () => ({
  startBalanceMonitoringJob: jest.fn(),
  stopBalanceMonitoringJob: jest.fn(),
}));
jest.mock('@api/lib/email.service', () => ({
  sendPaymentConfirmationEmail: jest.fn(),
  sendAISummaryNotification: jest.fn(),
}));
jest.mock('@api/realtime/socket', () => ({
  initSocket: jest.fn(),
  emitToClinic: jest.fn(),
}));
jest.mock('@api/utils/tracer', () => ({
  withSpan: jest.fn((_name: string, _attrs: unknown, fn: () => unknown) => fn()),
  currentTraceId: jest.fn(() => undefined),
}));
jest.mock('@api/services/metrics.service', () => ({
  paymentsInitiatedTotal: { inc: jest.fn() },
  paymentsConfirmedTotal: { inc: jest.fn() },
  aiRequestsTotal: { inc: jest.fn() },
  mongodbConnectionPoolSize: { set: jest.fn() },
  httpRequestDuration: { observe: jest.fn(), startTimer: jest.fn(() => jest.fn()) },
  httpRequestsTotal: { inc: jest.fn() },
}));
jest.mock('@api/middlewares/metrics.middleware', () => ({
  metricsMiddleware: (_req: unknown, _res: unknown, next: () => void) => next(),
}));
jest.mock('@api/modules/payments/services/fee-budget.service', () => ({
  checkFeeBudget: jest.fn().mockResolvedValue(true),
  recordSponsoredFee: jest.fn().mockResolvedValue(undefined),
}));

// ── imports (after mocks) ─────────────────────────────────────────────────────

import request from 'supertest';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import app from '@api/app';
import { PaymentRecordModel } from './models/payment-record.model';
import { stellarClient } from './services/stellar-client';

// ── helpers ───────────────────────────────────────────────────────────────────

const SECRET = 'test-access-secret-32-chars-long!!';
const CLINIC_A = new mongoose.Types.ObjectId().toHexString();
const CLINIC_B = new mongoose.Types.ObjectId().toHexString();
const DESTINATION = 'GDESTINATION0000000000000000000000000000000000000000000000';

function makeToken(clinicId: string, role = 'CLINIC_ADMIN') {
  return jwt.sign({ userId: new mongoose.Types.ObjectId().toHexString(), role, clinicId }, SECRET, {
    expiresIn: '15m',
    issuer: 'health-watchers-api',
    audience: 'health-watchers-client',
  });
}

const tokenA = makeToken(CLINIC_A);
const tokenB = makeToken(CLINIC_B);

function makeStellarTx(
  overrides: Partial<{
    hash: string;
    to: string;
    amount: string;
    asset: string;
    memo: string;
  }> = {}
) {
  return {
    hash: overrides.hash ?? 'TX_HASH_VALID',
    from: 'GSOURCE000000000000000000000000000000000000000000000000000',
    to: overrides.to ?? DESTINATION,
    amount: overrides.amount ?? '10.0000000',
    asset: overrides.asset ?? 'XLM',
    memo: overrides.memo ?? '',
    timestamp: new Date().toISOString(),
    success: true,
  };
}

// ── MongoDB Memory Server lifecycle ───────────────────────────────────────────

let mongod: MongoMemoryServer;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

afterEach(async () => {
  await PaymentRecordModel.deleteMany({});
  jest.clearAllMocks();
});

// ── POST /api/v1/payments/intent ──────────────────────────────────────────────

describe('POST /api/v1/payments/intent', () => {
  it('returns 201 with intent details for valid request', async () => {
    const res = await request(app)
      .post('/api/v1/payments/intent')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ amount: '10.0000000', destination: DESTINATION });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe('success');
    expect(res.body.data.intentId).toBeDefined();
    expect(res.body.data.status).toBe('pending');
    expect(res.body.data.amount).toBe('10.0000000');
    expect(res.body.data.destination).toBe(DESTINATION);
  });

  it('clinicId is taken from JWT, not request body', async () => {
    const res = await request(app)
      .post('/api/v1/payments/intent')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ amount: '5.0000000', destination: DESTINATION, clinicId: CLINIC_B });

    expect(res.status).toBe(201);
    const record = await PaymentRecordModel.findOne({ intentId: res.body.data.intentId });
    expect(record!.clinicId).toBe(CLINIC_A);
  });

  it('intentId is a valid UUID', async () => {
    const res = await request(app)
      .post('/api/v1/payments/intent')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ amount: '1.0000000', destination: DESTINATION });

    expect(res.status).toBe(201);
    expect(res.body.data.intentId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    );
  });

  it('memo format is HW:{8 uppercase chars}', async () => {
    const res = await request(app)
      .post('/api/v1/payments/intent')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ amount: '1.0000000', destination: DESTINATION });

    expect(res.status).toBe(201);
    expect(res.body.data.memo).toMatch(/^HW:[0-9A-F]{8}$/);
  });

  it('PaymentRecord created with status pending', async () => {
    const res = await request(app)
      .post('/api/v1/payments/intent')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ amount: '7.5000000', destination: DESTINATION });

    expect(res.status).toBe(201);
    const record = await PaymentRecordModel.findOne({ intentId: res.body.data.intentId });
    expect(record).not.toBeNull();
    expect(record!.status).toBe('pending');
  });

  it('returns 400 for missing amount', async () => {
    const res = await request(app)
      .post('/api/v1/payments/intent')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ destination: DESTINATION });

    expect(res.status).toBe(400);
  });

  it('returns 400 for missing destination', async () => {
    const res = await request(app)
      .post('/api/v1/payments/intent')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ amount: '10.0000000' });

    expect(res.status).toBe(400);
  });

  it('returns 401 without authentication', async () => {
    const res = await request(app)
      .post('/api/v1/payments/intent')
      .send({ amount: '10.0000000', destination: DESTINATION });

    expect(res.status).toBe(401);
  });
});

// ── GET /api/v1/payments/status/:intentId ─────────────────────────────────────

describe('GET /api/v1/payments/status/:intentId', () => {
  it('returns payment status for valid intentId', async () => {
    const created = await PaymentRecordModel.create({
      intentId: 'intent-status-1',
      amount: '20.0000000',
      destination: DESTINATION,
      memo: 'HW:ABCD1234',
      clinicId: CLINIC_A,
      status: 'pending',
      assetCode: 'XLM',
    });

    const res = await request(app)
      .get(`/api/v1/payments/status/${created.intentId}`)
      .set('Authorization', `Bearer ${tokenA}`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('success');
    expect(res.body.data.intentId).toBe(created.intentId);
    expect(res.body.data.status).toBe('pending');
  });

  it('returns 404 for non-existent intentId', async () => {
    const res = await request(app)
      .get('/api/v1/payments/status/non-existent-intent')
      .set('Authorization', `Bearer ${tokenA}`);

    expect(res.status).toBe(404);
  });

  it('returns 404 for intentId from another clinic', async () => {
    await PaymentRecordModel.create({
      intentId: 'intent-clinic-b-status',
      amount: '10.0000000',
      destination: DESTINATION,
      clinicId: CLINIC_B,
      status: 'pending',
      assetCode: 'XLM',
    });

    const res = await request(app)
      .get('/api/v1/payments/status/intent-clinic-b-status')
      .set('Authorization', `Bearer ${tokenA}`);

    expect(res.status).toBe(404);
  });

  it('returns 401 without authentication', async () => {
    const res = await request(app).get('/api/v1/payments/status/some-intent');
    expect(res.status).toBe(401);
  });
});

// ── GET /api/v1/payments (list) ───────────────────────────────────────────────

describe('GET /api/v1/payments (payment list)', () => {
  it('returns payment records for the authenticated clinic', async () => {
    await PaymentRecordModel.create({
      intentId: 'intent-list-1',
      amount: '20.0000000',
      destination: DESTINATION,
      memo: 'HW:ABCD1234',
      clinicId: CLINIC_A,
      status: 'pending',
      assetCode: 'XLM',
    });

    const res = await request(app).get('/api/v1/payments').set('Authorization', `Bearer ${tokenA}`);

    expect(res.status).toBe(200);
    const found = res.body.data.find((p: any) => p.intentId === 'intent-list-1');
    expect(found).toBeDefined();
    expect(found.status).toBe('pending');
  });

  it('returns 401 without authentication', async () => {
    const res = await request(app).get('/api/v1/payments');
    expect(res.status).toBe(401);
  });

  it('clinic A cannot see clinic B payments (multi-tenant isolation)', async () => {
    await PaymentRecordModel.create({
      intentId: 'intent-clinic-b',
      amount: '50.0000000',
      destination: DESTINATION,
      clinicId: CLINIC_B,
      status: 'pending',
      assetCode: 'XLM',
    });

    const res = await request(app).get('/api/v1/payments').set('Authorization', `Bearer ${tokenA}`);

    expect(res.status).toBe(200);
    const found = res.body.data.find((p: any) => p.intentId === 'intent-clinic-b');
    expect(found).toBeUndefined();
  });
});

// ── PATCH /api/v1/payments/:intentId/confirm ─────────────────────────────────

describe('PATCH /api/v1/payments/:intentId/confirm', () => {
  async function createPendingPayment(
    clinicId: string,
    overrides: Partial<{
      intentId: string;
      amount: string;
      memo: string;
    }> = {}
  ) {
    return PaymentRecordModel.create({
      intentId: overrides.intentId ?? `intent-${Date.now()}`,
      amount: overrides.amount ?? '10.0000000',
      destination: DESTINATION,
      memo: overrides.memo ?? 'HW:ABCD1234',
      clinicId,
      status: 'pending',
      assetCode: 'XLM',
    });
  }

  it('returns 200 and confirms payment for valid txHash', async () => {
    const payment = await createPendingPayment(CLINIC_A, { intentId: 'intent-confirm-ok' });
    const tx = makeStellarTx({ hash: 'TX_OK', amount: payment.amount, memo: payment.memo! });

    (stellarClient.verifyTransaction as jest.Mock).mockResolvedValue({
      found: true,
      transaction: tx,
    });

    const res = await request(app)
      .patch(`/api/v1/payments/${payment.intentId}/confirm`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ txHash: 'TX_OK' });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('confirmed');
    expect(res.body.data.txHash).toBe('TX_OK');

    const updated = await PaymentRecordModel.findOne({ intentId: payment.intentId });
    expect(updated!.status).toBe('confirmed');
    expect(updated!.txHash).toBe('TX_OK');
    expect(updated!.confirmedAt).toBeDefined();
  });

  it('sets txHash and confirmedAt on PaymentRecord', async () => {
    const payment = await createPendingPayment(CLINIC_A, { intentId: 'intent-confirm-fields' });
    const tx = makeStellarTx({ hash: 'TX_FIELDS', amount: payment.amount, memo: payment.memo! });

    (stellarClient.verifyTransaction as jest.Mock).mockResolvedValue({
      found: true,
      transaction: tx,
    });

    await request(app)
      .patch(`/api/v1/payments/${payment.intentId}/confirm`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ txHash: 'TX_FIELDS' });

    const updated = await PaymentRecordModel.findOne({ intentId: payment.intentId });
    expect(updated!.txHash).toBe('TX_FIELDS');
    expect(updated!.confirmedAt).toBeInstanceOf(Date);
  });

  it('returns 400 when txHash not found on Stellar', async () => {
    const payment = await createPendingPayment(CLINIC_A, { intentId: 'intent-not-found' });

    (stellarClient.verifyTransaction as jest.Mock).mockResolvedValue({
      found: false,
      error: 'Transaction not found',
    });

    const res = await request(app)
      .patch(`/api/v1/payments/${payment.intentId}/confirm`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ txHash: 'TX_MISSING' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('TransactionNotFound');

    const updated = await PaymentRecordModel.findOne({ intentId: payment.intentId });
    expect(updated!.status).toBe('failed');
  });

  it('returns 400 for amount mismatch', async () => {
    const payment = await createPendingPayment(CLINIC_A, {
      intentId: 'intent-amount-mismatch',
      amount: '10.0000000',
    });
    const tx = makeStellarTx({ hash: 'TX_AMT', amount: '99.0000000', memo: payment.memo! });

    (stellarClient.verifyTransaction as jest.Mock).mockResolvedValue({
      found: true,
      transaction: tx,
    });

    const res = await request(app)
      .patch(`/api/v1/payments/${payment.intentId}/confirm`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ txHash: 'TX_AMT' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('AmountMismatch');
  });

  it('returns 400 for destination mismatch', async () => {
    const payment = await createPendingPayment(CLINIC_A, { intentId: 'intent-dest-mismatch' });
    const tx = makeStellarTx({
      hash: 'TX_DEST',
      to: 'GWRONG000000000000000000000000000000000000000000000000000',
      amount: payment.amount,
      memo: payment.memo!,
    });

    (stellarClient.verifyTransaction as jest.Mock).mockResolvedValue({
      found: true,
      transaction: tx,
    });

    const res = await request(app)
      .patch(`/api/v1/payments/${payment.intentId}/confirm`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ txHash: 'TX_DEST' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('DestinationMismatch');
  });

  it('returns 409 for already-confirmed payment', async () => {
    const payment = await PaymentRecordModel.create({
      intentId: 'intent-already-confirmed',
      amount: '10.0000000',
      destination: DESTINATION,
      clinicId: CLINIC_A,
      status: 'confirmed',
      txHash: 'TX_ALREADY',
      assetCode: 'XLM',
    });

    const res = await request(app)
      .patch(`/api/v1/payments/${payment.intentId}/confirm`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ txHash: 'TX_NEW' });

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('AlreadyConfirmed');
    expect(stellarClient.verifyTransaction).not.toHaveBeenCalled();
  });

  it('returns 404 for non-existent intentId', async () => {
    const res = await request(app)
      .patch('/api/v1/payments/non-existent-intent/confirm')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ txHash: 'TX_ANY' });

    expect(res.status).toBe(404);
  });

  it('returns 401 without authentication', async () => {
    const res = await request(app)
      .patch('/api/v1/payments/some-intent/confirm')
      .send({ txHash: 'TX_ANY' });

    expect(res.status).toBe(401);
  });

  it('simulates Stellar network timeout (verifyTransaction throws)', async () => {
    const payment = await createPendingPayment(CLINIC_A, { intentId: 'intent-timeout' });

    (stellarClient.verifyTransaction as jest.Mock).mockRejectedValue(
      Object.assign(new Error('timeout of 10000ms exceeded'), { code: 'ECONNABORTED' })
    );

    const res = await request(app)
      .patch(`/api/v1/payments/${payment.intentId}/confirm`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ txHash: 'TX_TIMEOUT' });

    expect(res.status).toBe(500);
  });
});

// ── Multi-tenant isolation ────────────────────────────────────────────────────

describe('Multi-tenant isolation', () => {
  it('clinic A cannot confirm clinic B payment intent', async () => {
    const payment = await PaymentRecordModel.create({
      intentId: 'intent-clinic-b-only',
      amount: '10.0000000',
      destination: DESTINATION,
      clinicId: CLINIC_B,
      status: 'pending',
      assetCode: 'XLM',
    });

    const res = await request(app)
      .patch(`/api/v1/payments/${payment.intentId}/confirm`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ txHash: 'TX_CROSS' });

    expect(res.status).toBe(404);
    expect(stellarClient.verifyTransaction).not.toHaveBeenCalled();
  });

  it('clinic A cannot see clinic B payment intents in list', async () => {
    await PaymentRecordModel.create({
      intentId: 'intent-b-secret',
      amount: '999.0000000',
      destination: DESTINATION,
      clinicId: CLINIC_B,
      status: 'pending',
      assetCode: 'XLM',
    });

    const res = await request(app).get('/api/v1/payments').set('Authorization', `Bearer ${tokenA}`);

    expect(res.status).toBe(200);
    expect(res.body.data.find((p: any) => p.intentId === 'intent-b-secret')).toBeUndefined();
  });
});

// ── Full payment lifecycle (intent → confirm) ─────────────────────────────────

describe('Full payment lifecycle', () => {
  it('creates intent then confirms it end-to-end', async () => {
    // Step 1: create intent
    const intentRes = await request(app)
      .post('/api/v1/payments/intent')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ amount: '25.0000000', destination: DESTINATION });

    expect(intentRes.status).toBe(201);
    const { intentId, memo, amount } = intentRes.body.data;

    // Verify DB state after intent creation
    const pending = await PaymentRecordModel.findOne({ intentId });
    expect(pending!.status).toBe('pending');

    // Step 2: confirm with matching Stellar transaction
    const tx = makeStellarTx({ hash: 'TX_LIFECYCLE', amount, memo });
    (stellarClient.verifyTransaction as jest.Mock).mockResolvedValue({
      found: true,
      transaction: tx,
    });

    const confirmRes = await request(app)
      .patch(`/api/v1/payments/${intentId}/confirm`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ txHash: 'TX_LIFECYCLE' });

    expect(confirmRes.status).toBe(200);
    expect(confirmRes.body.data.status).toBe('confirmed');

    // Verify final DB state
    const confirmed = await PaymentRecordModel.findOne({ intentId });
    expect(confirmed!.status).toBe('confirmed');
    expect(confirmed!.txHash).toBe('TX_LIFECYCLE');
    expect(confirmed!.confirmedAt).toBeInstanceOf(Date);
  });
});
