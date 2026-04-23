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
