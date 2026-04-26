/**
 * Unit tests for PATCH /api/v1/payments/:intentId/confirm
 */

process.env.MONGO_URI = 'mongodb://localhost:27017/test';
process.env.JWT_ACCESS_TOKEN_SECRET = 'abcdefghijklmnopqrstuvwxyz012345';
process.env.JWT_REFRESH_TOKEN_SECRET = 'abcdefghijklmnopqrstuvwxyz012345';
process.env.API_PORT = '3001';

jest.mock('@health-watchers/config', () => ({
  config: {
    jwt: {
      accessTokenSecret: 'test-access-secret',
      refreshTokenSecret: 'test-refresh-secret',
      issuer: 'health-watchers-api',
      audience: 'health-watchers-client',
    },
    apiPort: '3001',
    nodeEnv: 'test',
    mongoUri: '',
    stellarNetwork: 'testnet',
    stellarHorizonUrl: '',
    stellarSecretKey: '',
    stellar: { network: 'testnet', horizonUrl: '', secretKey: '', platformPublicKey: '' },
    supportedAssets: ['XLM'],
    stellarServiceUrl: '',
    geminiApiKey: '',
    fieldEncryptionKey: '',
  },
}));

jest.mock('@api/modules/auth/auth.controller', () => ({ authRoutes: require('express').Router() }));
jest.mock('@api/modules/patients/patients.controller', () => ({
  patientRoutes: require('express').Router(),
}));
jest.mock('@api/modules/encounters/encounters.controller', () => ({
  encounterRoutes: require('express').Router(),
}));
jest.mock('@api/modules/ai/ai.routes', () => require('express').Router());
jest.mock('@api/modules/dashboard/dashboard.routes', () => require('express').Router());
jest.mock('@api/modules/appointments/appointments.controller', () => ({
  appointmentRoutes: require('express').Router(),
}));
jest.mock('@api/modules/clinics/clinics.controller', () => ({
  clinicRoutes: require('express').Router(),
}));

jest.mock('@api/config/db', () => ({
  connectDB: jest.fn().mockReturnValue(new Promise(() => {})),
}));
jest.mock('@api/docs/swagger', () => ({ setupSwagger: jest.fn() }));
jest.mock('@api/modules/payments/services/payment-expiration-job', () => ({
  startPaymentExpirationJob: jest.fn(),
  stopPaymentExpirationJob: jest.fn(),
}));
jest.mock('@api/utils/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

jest.mock('@api/modules/payments/models/payment-record.model', () => ({
  PaymentRecordModel: {
    findOne: jest.fn(),
    findByIdAndUpdate: jest.fn(),
    create: jest.fn(),
    countDocuments: jest.fn(),
    find: jest.fn(),
  },
}));

jest.mock('@api/modules/payments/services/stellar-client', () => ({
  stellarClient: {
    verifyTransaction: jest.fn(),
    findPaths: jest.fn(),
    getOrderbook: jest.fn(),
    getFeeEstimate: jest.fn(),
  },
}));

import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '@api/app';
import { PaymentRecordModel } from './models/payment-record.model';
import { stellarClient } from './services/stellar-client';

const TEST_USER_ID = '507f1f77bcf86cd799439011';

function makeToken(): string {
  return jwt.sign(
    { userId: TEST_USER_ID, role: 'CLINIC_ADMIN', clinicId: 'clinic-abc' },
    'test-access-secret',
    {
      expiresIn: '15m',
      issuer: 'health-watchers-api',
      audience: 'health-watchers-client',
    }
  );
}

const pendingPayment = {
  _id: '507f1f77bcf86cd799439012',
  intentId: 'intent-1',
  destination: 'GDESTXXXXXX',
  amount: '25.00',
  assetCode: 'XLM',
  clinicId: 'clinic-abc',
  status: 'pending',
};

describe('PATCH /api/v1/payments/:intentId/confirm', () => {
  const token = makeToken();

  beforeEach(() => {
    jest.clearAllMocks();
    (PaymentRecordModel.findOne as jest.Mock).mockReset();
    (PaymentRecordModel.findByIdAndUpdate as jest.Mock).mockReset();
    (stellarClient.verifyTransaction as jest.Mock).mockReset();
  });

  it('confirms a pending payment with valid txHash and returns status confirmed', async () => {
    (PaymentRecordModel.findOne as jest.Mock).mockResolvedValue(pendingPayment);
    (stellarClient.verifyTransaction as jest.Mock).mockResolvedValue({
      found: true,
      transaction: {
        hash: 'valid-tx',
        from: 'GFROM',
        to: pendingPayment.destination,
        amount: pendingPayment.amount,
        asset: 'XLM',
        timestamp: new Date().toISOString(),
        success: true,
      },
    });
    (PaymentRecordModel.findByIdAndUpdate as jest.Mock).mockResolvedValue({
      ...pendingPayment,
      status: 'confirmed',
      txHash: 'valid-tx',
    });

    const res = await request(app)
      .patch(`/api/v1/payments/${pendingPayment.intentId}/confirm`)
      .set('Authorization', `Bearer ${token}`)
      .send({ txHash: 'valid-tx' });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('success');
    expect(res.body.data.status).toBe('confirmed');

    expect(PaymentRecordModel.findByIdAndUpdate).toHaveBeenCalledWith(
      pendingPayment._id,
      expect.objectContaining({ status: 'confirmed', txHash: 'valid-tx' }),
      { new: true }
    );
  });

  it('marks payment failed when txHash is invalid/transaction not found', async () => {
    (PaymentRecordModel.findOne as jest.Mock).mockResolvedValue(pendingPayment);
    (stellarClient.verifyTransaction as jest.Mock).mockResolvedValue({
      found: false,
      error: 'Transaction not found',
    });
    (PaymentRecordModel.findByIdAndUpdate as jest.Mock).mockResolvedValue({
      ...pendingPayment,
      status: 'failed',
      txHash: 'invalid-tx',
    });

    const res = await request(app)
      .patch(`/api/v1/payments/${pendingPayment.intentId}/confirm`)
      .set('Authorization', `Bearer ${token}`)
      .send({ txHash: 'invalid-tx' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('TransactionNotFound');
    expect(PaymentRecordModel.findByIdAndUpdate).toHaveBeenCalledWith(
      pendingPayment._id,
      expect.objectContaining({ status: 'failed', txHash: 'invalid-tx' })
    );
  });

  it('returns 409 when payment is already confirmed', async () => {
    (PaymentRecordModel.findOne as jest.Mock).mockResolvedValue({
      ...pendingPayment,
      status: 'confirmed',
      txHash: 'already-tx',
    });

    const res = await request(app)
      .patch(`/api/v1/payments/${pendingPayment.intentId}/confirm`)
      .set('Authorization', `Bearer ${token}`)
      .send({ txHash: 'another-tx' });

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('AlreadyConfirmed');
    expect(stellarClient.verifyTransaction).not.toHaveBeenCalled();
  });
});

describe('GET /api/v1/payments/paths', () => {
  const token = makeToken();

  it('returns available payment paths', async () => {
    const mockPaths = [
      {
        sourceAssetCode: 'USDC',
        sourceAmount: '10.5',
        destinationAssetCode: 'XLM',
        destinationAmount: '100',
        path: [],
      },
    ];
    (stellarClient.findPaths as jest.Mock).mockResolvedValue(mockPaths);

    const res = await request(app)
      .get('/api/v1/payments/paths')
      .query({ sourceAsset: 'USDC', destinationAsset: 'XLM', amount: '100' })
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('success');
    expect(res.body.data).toEqual(mockPaths);
  });
});

describe('GET /api/v1/payments/fee-estimate', () => {
  const token = makeToken();

  const mockFeeData = {
    slow:     { stroops: '100', xlm: '0.0000100', confirmationTime: '~60s' },
    standard: { stroops: '200', xlm: '0.0000200', confirmationTime: '~30s' },
    fast:     { stroops: '500', xlm: '0.0000500', confirmationTime: '~10s' },
    raw: { min: '100', mode: '200', max: '1000', p10: '100', p50: '200', p90: '500', p99: '900' },
  };

  beforeEach(() => jest.clearAllMocks());

  it('returns fee tiers from stellar-service', async () => {
    (stellarClient.getFeeEstimate as jest.Mock).mockResolvedValue(mockFeeData);

    const res = await request(app)
      .get('/api/v1/payments/fee-estimate')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('success');
    expect(res.body.data.slow).toMatchObject({ stroops: '100', confirmationTime: '~60s' });
    expect(res.body.data.standard).toMatchObject({ stroops: '200', confirmationTime: '~30s' });
    expect(res.body.data.fast).toMatchObject({ stroops: '500', confirmationTime: '~10s' });
  });

  it('returns 502 when stellar-service is unavailable', async () => {
    (stellarClient.getFeeEstimate as jest.Mock).mockRejectedValue(new Error('Horizon timeout'));

    const res = await request(app)
      .get('/api/v1/payments/fee-estimate')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(502);
    expect(res.body.error).toBe('StellarServiceError');
  });

  it('returns 401 without auth token', async () => {
    const res = await request(app).get('/api/v1/payments/fee-estimate');
    expect(res.status).toBe(401);
  });
});

describe('GET /api/v1/payments/stellar/orderbook', () => {
  const token = makeToken();

  it('returns current orderbook for XLM/USDC', async () => {
    const mockOrderbook = {
      base: 'XLM',
      counter: 'USDC',
      bids: [{ price: '0.1', amount: '1000' }],
      asks: [{ price: '0.11', amount: '1000' }],
    };
    (stellarClient.getOrderbook as jest.Mock).mockResolvedValue(mockOrderbook);

    const res = await request(app)
      .get('/api/v1/payments/stellar/orderbook')
      .query({ base: 'XLM', counter: 'USDC' })
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('success');
    expect(res.body.data).toEqual(mockOrderbook);
  });
});

describe('POST /api/v1/payments/intent — feeStrategy', () => {
  const token = makeToken();

  beforeEach(() => jest.clearAllMocks());

  it('stores feeStrategy=fast on the payment record', async () => {
    const created = {
      _id: '507f1f77bcf86cd799439099',
      intentId: 'intent-fee-1',
      amount: '10.00',
      destination: 'GDEST123',
      assetCode: 'XLM',
      clinicId: 'clinic-abc',
      status: 'pending',
      feeStrategy: 'fast',
    };
    (PaymentRecordModel.create as jest.Mock).mockResolvedValue(created);

    const res = await request(app)
      .post('/api/v1/payments/intent')
      .set('Authorization', `Bearer ${token}`)
      .send({ amount: '10.00', destination: 'GDEST123', feeStrategy: 'fast' });

    expect(res.status).toBe(201);
    expect(PaymentRecordModel.create).toHaveBeenCalledWith(
      expect.objectContaining({ feeStrategy: 'fast' }),
    );
  });

  it('defaults feeStrategy to standard when not provided', async () => {
    const created = {
      _id: '507f1f77bcf86cd799439098',
      intentId: 'intent-fee-2',
      amount: '5.00',
      destination: 'GDEST456',
      assetCode: 'XLM',
      clinicId: 'clinic-abc',
      status: 'pending',
      feeStrategy: 'standard',
    };
    (PaymentRecordModel.create as jest.Mock).mockResolvedValue(created);

    const res = await request(app)
      .post('/api/v1/payments/intent')
      .set('Authorization', `Bearer ${token}`)
      .send({ amount: '5.00', destination: 'GDEST456' });

    expect(res.status).toBe(201);
    expect(PaymentRecordModel.create).toHaveBeenCalledWith(
      expect.objectContaining({ feeStrategy: 'standard' }),
    );
  });

  it('rejects invalid feeStrategy value', async () => {
    const res = await request(app)
      .post('/api/v1/payments/intent')
      .set('Authorization', `Bearer ${token}`)
      .send({ amount: '5.00', destination: 'GDEST456', feeStrategy: 'turbo' });

    expect(res.status).toBe(400);
  });
});
