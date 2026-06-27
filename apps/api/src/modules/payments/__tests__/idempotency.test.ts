/**
 * Idempotency tests for POST /api/v1/payments/intent.
 *
 * Uses MongoMemoryServer for a real in-process DB and mocks the stellar-service
 * client so no real network calls are made.
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
import { paymentRoutes } from '../payments.controller';
import { authenticate } from '@api/middlewares/auth.middleware';

// ── Minimal test app ──────────────────────────────────────────────────────────
function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/v1/payments', paymentRoutes);
  return app;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const SECRET = 'test-access-secret-32-chars-long!!';
const DESTINATION = 'GDESTINATION123456789012345678901234567890123456';
const CLINIC_A = 'clinic-aaa';
const CLINIC_B = 'clinic-bbb';

function makeToken(clinicId: string, role = 'CLINIC_ADMIN'): string {
  return jwt.sign({ userId: new mongoose.Types.ObjectId().toString(), role, clinicId }, SECRET, {
    expiresIn: '15m',
    issuer: 'health-watchers-api',
    audience: 'health-watchers-client',
  });
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
// Idempotency tests
// ─────────────────────────────────────────────────────────────────────────────

describe('POST /api/v1/payments/intent — idempotency', () => {
  it('returns existing record and does NOT create a second on duplicate idempotencyKey', async () => {
    const token = makeToken(CLINIC_A);

    // First call — creates the record
    const first = await request(app)
      .post('/api/v1/payments/intent')
      .set('Authorization', `Bearer ${token}`)
      .send({ amount: '10.00', destination: DESTINATION, idempotencyKey: 'key-001' });

    expect(first.status).toBe(201);
    const firstIntentId = first.body.data.intentId;

    // Second call — same key + same clinic
    const second = await request(app)
      .post('/api/v1/payments/intent')
      .set('Authorization', `Bearer ${token}`)
      .send({ amount: '10.00', destination: DESTINATION, idempotencyKey: 'key-001' });

    expect(second.status).toBe(200);
    expect(second.body.data.intentId).toBe(firstIntentId);

    // Only one record must exist in the DB
    const count = await PaymentRecordModel.countDocuments({ idempotencyKey: 'key-001' });
    expect(count).toBe(1);
  });

  it('includes { idempotent: true } in the response on a duplicate call', async () => {
    const token = makeToken(CLINIC_A);

    await request(app)
      .post('/api/v1/payments/intent')
      .set('Authorization', `Bearer ${token}`)
      .send({ amount: '5.00', destination: DESTINATION, idempotencyKey: 'key-002' });

    const second = await request(app)
      .post('/api/v1/payments/intent')
      .set('Authorization', `Bearer ${token}`)
      .send({ amount: '5.00', destination: DESTINATION, idempotencyKey: 'key-002' });

    expect(second.status).toBe(200);
    expect(second.body.idempotent).toBe(true);
    expect(second.body.status).toBe('success');
  });

  it('creates a new record when idempotencyKey is omitted (backward compatible)', async () => {
    const token = makeToken(CLINIC_A);

    const res = await request(app)
      .post('/api/v1/payments/intent')
      .set('Authorization', `Bearer ${token}`)
      .send({ amount: '7.50', destination: DESTINATION });

    expect(res.status).toBe(201);
    expect(res.body.idempotent).toBeUndefined();
    expect(res.body.data.intentId).toBeDefined();
  });

  it('treats the same idempotencyKey from a different clinic as a new intent', async () => {
    const tokenA = makeToken(CLINIC_A);
    const tokenB = makeToken(CLINIC_B);
    const sharedKey = 'key-shared';

    // Clinic A creates a record with the shared key
    const firstA = await request(app)
      .post('/api/v1/payments/intent')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ amount: '10.00', destination: DESTINATION, idempotencyKey: sharedKey });

    expect(firstA.status).toBe(201);

    // Clinic B sends the same key — should create a NEW record (different clinic scope)
    const firstB = await request(app)
      .post('/api/v1/payments/intent')
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ amount: '10.00', destination: DESTINATION, idempotencyKey: sharedKey });

    expect(firstB.status).toBe(201);
    expect(firstB.body.idempotent).toBeUndefined();
    expect(firstB.body.data.intentId).not.toBe(firstA.body.data.intentId);

    // Two distinct records exist — one per clinic
    const recordA = await PaymentRecordModel.findOne({
      idempotencyKey: sharedKey,
      clinicId: CLINIC_A,
    });
    const recordB = await PaymentRecordModel.findOne({
      idempotencyKey: sharedKey,
      clinicId: CLINIC_B,
    });
    expect(recordA).not.toBeNull();
    expect(recordB).not.toBeNull();
    expect(recordA!.intentId).not.toBe(recordB!.intentId);
  });

  it('stores idempotencyKey on the created record', async () => {
    const token = makeToken(CLINIC_A);

    const res = await request(app)
      .post('/api/v1/payments/intent')
      .set('Authorization', `Bearer ${token}`)
      .send({ amount: '3.00', destination: DESTINATION, idempotencyKey: 'key-stored' });

    expect(res.status).toBe(201);
    const record = await PaymentRecordModel.findOne({ intentId: res.body.data.intentId });
    expect(record?.idempotencyKey).toBe('key-stored');
  });

  it('does not set idempotencyKey on the record when not provided', async () => {
    const token = makeToken(CLINIC_A);

    const res = await request(app)
      .post('/api/v1/payments/intent')
      .set('Authorization', `Bearer ${token}`)
      .send({ amount: '3.00', destination: DESTINATION });

    expect(res.status).toBe(201);
    const record = await PaymentRecordModel.findOne({ intentId: res.body.data.intentId });
    expect(record?.idempotencyKey).toBeUndefined();
  });
});
