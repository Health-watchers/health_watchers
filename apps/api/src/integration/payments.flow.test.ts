/**
 * Integration tests — payment processing workflows.
 *
 * Exercises the real payments controller against an in-memory MongoDB with the
 * Stellar service mocked:
 *   - payment intent creation (memo, UUID, pending status)
 *   - confirmation via the Stellar transaction verification path
 *   - authentication + clinic scoping enforcement
 */
process.env.MONGO_URI = 'mongodb://localhost:27017/test';
process.env.JWT_ACCESS_TOKEN_SECRET = 'test-access-secret-32-chars-long!!';
process.env.JWT_REFRESH_TOKEN_SECRET = 'test-refresh-secret-32-chars-long!';
process.env.API_PORT = '3001';
process.env.NODE_ENV = 'test';
process.env.STELLAR_NETWORK = 'testnet';

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

jest.mock('@api/lib/email.service', () => {
  const handler = {
    get: (_target: unknown, prop: string | symbol) =>
      typeof prop === 'string' ? jest.fn() : undefined,
  };
  return new Proxy({}, handler);
});

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

import express from 'express';
import request from 'supertest';
import { paymentRoutes } from '../modules/payments/payments.controller';
import { PaymentRecordModel } from '../modules/payments/models/payment-record.model';
import { stellarClient } from '../modules/payments/services/stellar-client';
import { startTestDb, stopTestDb, clearDb, TestDb } from './helpers/test-db';
import { createClinicWithAdmin, makeAccessToken } from './helpers/factories';

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/v1/payments', paymentRoutes);
  // Surface unhandled errors with their message so failures are diagnosable
  app.use(
    (err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
      res.status(500).json({ error: err.message });
    }
  );
  return app;
}

const DESTINATION = 'GDESTINATION123456789012345678901234567890123456';

/** Build a valid stellar verification response matching a payment intent. */
function validTx(memo: string, amount = '10.00') {
  return {
    found: true,
    transaction: {
      hash: 'valid-tx-hash-001',
      from: 'GFROM',
      to: DESTINATION,
      amount: `${parseFloat(amount).toFixed(7)}`,
      asset: 'XLM',
      memo,
      timestamp: new Date().toISOString(),
      success: true,
    },
  };
}

describe('payment processing integration flows', () => {
  let testDb: TestDb;
  let app: express.Express;

  beforeAll(async () => {
    testDb = await startTestDb();
    app = buildApp();
  });

  afterEach(async () => {
    await clearDb();
    jest.clearAllMocks();
  });

  afterAll(async () => {
    await stopTestDb(testDb);
  });

  describe('POST /api/v1/payments/intent', () => {
    it('creates a pending payment intent with a memo and UUID', async () => {
      const { clinic, admin } = await createClinicWithAdmin();
      const token = makeAccessToken({
        userId: admin._id.toString(),
        role: 'CLINIC_ADMIN',
        clinicId: clinic._id.toString(),
      });

      const res = await request(app)
        .post('/api/v1/payments/intent')
        .set('Authorization', `Bearer ${token}`)
        .send({ amount: '10.00', destination: DESTINATION });

      expect(res.status).toBe(201);
      expect(res.body.status).toBe('success');
      expect(res.body.data.intentId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      );
      expect(res.body.data.memo).toMatch(/^HW:[A-F0-9]{8}$/);

      const record = await PaymentRecordModel.findOne({ intentId: res.body.data.intentId });
      expect(record).not.toBeNull();
      expect(record!.status).toBe('pending');
      expect(record!.clinicId).toBe(clinic._id.toString());
    });

    it('requires authentication', async () => {
      const res = await request(app)
        .post('/api/v1/payments/intent')
        .send({ amount: '10.00', destination: DESTINATION });
      expect(res.status).toBe(401);
    });

    it('returns 400 for a missing amount', async () => {
      const { clinic, admin } = await createClinicWithAdmin();
      const token = makeAccessToken({
        userId: admin._id.toString(),
        role: 'CLINIC_ADMIN',
        clinicId: clinic._id.toString(),
      });

      const res = await request(app)
        .post('/api/v1/payments/intent')
        .set('Authorization', `Bearer ${token}`)
        .send({ destination: DESTINATION });
      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/v1/payments', () => {
    it('lists payments for the clinic', async () => {
      const { clinic, admin } = await createClinicWithAdmin();
      const token = makeAccessToken({
        userId: admin._id.toString(),
        role: 'CLINIC_ADMIN',
        clinicId: clinic._id.toString(),
      });

      const res = await request(app)
        .get('/api/v1/payments')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
    });
  });

  describe('PATCH /api/v1/payments/:intentId/confirm', () => {
    it('confirms a payment when the Stellar transaction is valid', async () => {
      const { clinic, admin } = await createClinicWithAdmin();
      const token = makeAccessToken({
        userId: admin._id.toString(),
        role: 'CLINIC_ADMIN',
        clinicId: clinic._id.toString(),
      });

      const intent = await request(app)
        .post('/api/v1/payments/intent')
        .set('Authorization', `Bearer ${token}`)
        .send({ amount: '10.00', destination: DESTINATION });
      expect(intent.status).toBe(201);

      (stellarClient.verifyTransaction as jest.Mock).mockResolvedValue(
        validTx(intent.body.data.memo)
      );

      const res = await request(app)
        .patch(`/api/v1/payments/${intent.body.data.intentId}/confirm`)
        .set('Authorization', `Bearer ${token}`)
        .send({ txHash: 'valid-tx-hash-001' });

      expect(res.status).toBe(200);
      const record = await PaymentRecordModel.findOne({
        intentId: intent.body.data.intentId,
      });
      expect(record!.status).toBe('confirmed');
      expect(record!.txHash).toBe('valid-tx-hash-001');
    });

    it('marks the payment failed when the transaction is not found', async () => {
      const { clinic, admin } = await createClinicWithAdmin();
      const token = makeAccessToken({
        userId: admin._id.toString(),
        role: 'CLINIC_ADMIN',
        clinicId: clinic._id.toString(),
      });

      const intent = await request(app)
        .post('/api/v1/payments/intent')
        .set('Authorization', `Bearer ${token}`)
        .send({ amount: '10.00', destination: DESTINATION });

      (stellarClient.verifyTransaction as jest.Mock).mockResolvedValue({
        found: false,
        error: 'Transaction not found on Stellar blockchain',
      });

      const res = await request(app)
        .patch(`/api/v1/payments/${intent.body.data.intentId}/confirm`)
        .set('Authorization', `Bearer ${token}`)
        .send({ txHash: 'missing-tx-hash' });

      expect(res.status).toBe(400);
      const record = await PaymentRecordModel.findOne({
        intentId: intent.body.data.intentId,
      });
      expect(record!.status).toBe('failed');
    });
  });
});
