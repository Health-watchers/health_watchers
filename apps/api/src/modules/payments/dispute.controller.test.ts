/**
 * Tests for dispute endpoints:
 * POST /api/v1/payments/:intentId/dispute
 * GET  /api/v1/payments/disputes
 * PUT  /api/v1/payments/disputes/:id/resolve
 * POST /api/v1/payments/disputes/:id/refund
 */

process.env.MONGO_URI = 'mongodb://localhost:27017/test';
process.env.JWT_ACCESS_TOKEN_SECRET = 'abcdefghijklmnopqrstuvwxyz012345';
process.env.JWT_REFRESH_TOKEN_SECRET = 'abcdefghijklmnopqrstuvwxyz012345';
process.env.API_PORT = '3001';
process.env.NODE_ENV = 'test';

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
jest.mock('@api/modules/patients/patients.controller', () => ({ patientRoutes: require('express').Router() }));
jest.mock('@api/modules/encounters/encounters.controller', () => ({ encounterRoutes: require('express').Router() }));
jest.mock('@api/modules/ai/ai.routes', () => require('express').Router());
jest.mock('@api/modules/dashboard/dashboard.routes', () => require('express').Router());
jest.mock('@api/modules/appointments/appointments.controller', () => ({ appointmentRoutes: require('express').Router() }));
jest.mock('@api/modules/clinics/clinics.controller', () => ({ clinicRoutes: require('express').Router() }));
jest.mock('@api/config/db', () => ({ connectDB: jest.fn().mockReturnValue(new Promise(() => {})) }));
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

jest.mock('@api/modules/payments/models/payment-dispute.model', () => ({
  PaymentDisputeModel: {
    findOne: jest.fn(),
    find: jest.fn(),
    create: jest.fn(),
  },
}));

jest.mock('@api/modules/payments/services/stellar-client', () => ({
  stellarClient: {
    verifyTransaction: jest.fn(),
    findPaths: jest.fn(),
    getOrderbook: jest.fn(),
    getFeeEstimate: jest.fn(),
    issueRefund: jest.fn(),
  },
}));

jest.mock('@api/modules/audit/audit.service', () => ({
  auditLog: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@api/lib/email.service', () => ({
  sendDisputeOpenedEmail: jest.fn(),
  sendDisputeResolvedEmail: jest.fn(),
  sendPaymentConfirmationEmail: jest.fn(),
}));

import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '@api/app';
import { PaymentRecordModel } from './models/payment-record.model';
import { PaymentDisputeModel } from './models/payment-dispute.model';
import { stellarClient } from './services/stellar-client';

const CLINIC_ID = 'clinic-abc';
const USER_ID = '507f1f77bcf86cd799439011';
const DISPUTE_ID = '507f1f77bcf86cd799439020';
const INTENT_ID = 'intent-test-1';

function makeToken(role = 'CLINIC_ADMIN') {
  return jwt.sign(
    { userId: USER_ID, role, clinicId: CLINIC_ID },
    'test-access-secret',
    { expiresIn: '15m', issuer: 'health-watchers-api', audience: 'health-watchers-client' }
  );
}

const mockPayment = {
  _id: '507f1f77bcf86cd799439012',
  intentId: INTENT_ID,
  amount: '50.00',
  destination: 'GDEST123',
  assetCode: 'XLM',
  clinicId: CLINIC_ID,
  status: 'confirmed',
  createdAt: new Date(),
};

const mockDispute = {
  _id: DISPUTE_ID,
  paymentIntentId: INTENT_ID,
  clinicId: CLINIC_ID,
  patientId: 'patient-1',
  reason: 'duplicate_payment',
  description: 'Charged twice',
  status: 'open',
  openedBy: USER_ID,
  openedAt: new Date(),
  refundIntentId: undefined,
  save: jest.fn().mockResolvedValue(undefined),
};

describe('POST /api/v1/payments/:intentId/dispute — Open dispute', () => {
  const token = makeToken();

  beforeEach(() => jest.clearAllMocks());

  it('opens a dispute for an existing payment', async () => {
    (PaymentRecordModel.findOne as jest.Mock).mockResolvedValue(mockPayment);
    (PaymentDisputeModel.findOne as jest.Mock).mockResolvedValue(null);
    (PaymentDisputeModel.create as jest.Mock).mockResolvedValue(mockDispute);

    const res = await request(app)
      .post(`/api/v1/payments/${INTENT_ID}/dispute`)
      .set('Authorization', `Bearer ${token}`)
      .send({ patientId: 'patient-1', reason: 'duplicate_payment', description: 'Charged twice' });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe('success');
    expect(res.body.data.reason).toBe('duplicate_payment');
  });

  it('returns 404 when payment not found', async () => {
    (PaymentRecordModel.findOne as jest.Mock).mockResolvedValue(null);

    const res = await request(app)
      .post(`/api/v1/payments/${INTENT_ID}/dispute`)
      .set('Authorization', `Bearer ${token}`)
      .send({ patientId: 'patient-1', reason: 'other', description: 'test' });

    expect(res.status).toBe(404);
  });

  it('returns 409 when dispute already exists', async () => {
    (PaymentRecordModel.findOne as jest.Mock).mockResolvedValue(mockPayment);
    (PaymentDisputeModel.findOne as jest.Mock).mockResolvedValue(mockDispute);

    const res = await request(app)
      .post(`/api/v1/payments/${INTENT_ID}/dispute`)
      .set('Authorization', `Bearer ${token}`)
      .send({ patientId: 'patient-1', reason: 'other', description: 'test' });

    expect(res.status).toBe(409);
  });

  it('returns 401 without auth token', async () => {
    const res = await request(app)
      .post(`/api/v1/payments/${INTENT_ID}/dispute`)
      .send({ patientId: 'patient-1', reason: 'other', description: 'test' });

    expect(res.status).toBe(401);
  });
});

describe('GET /api/v1/payments/disputes — List disputes', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns disputes for CLINIC_ADMIN', async () => {
    (PaymentDisputeModel.find as jest.Mock).mockReturnValue({
      sort: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue([mockDispute]) }),
    });

    const res = await request(app)
      .get('/api/v1/payments/disputes')
      .set('Authorization', `Bearer ${makeToken('CLINIC_ADMIN')}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
  });

  it('returns 403 for non-admin role', async () => {
    const res = await request(app)
      .get('/api/v1/payments/disputes')
      .set('Authorization', `Bearer ${makeToken('DOCTOR')}`);

    expect(res.status).toBe(403);
  });
});

describe('PUT /api/v1/payments/disputes/:id/resolve', () => {
  beforeEach(() => jest.clearAllMocks());

  it('resolves a dispute with valid status', async () => {
    const dispute = { ...mockDispute, status: 'open', save: jest.fn().mockResolvedValue(undefined) };
    (PaymentDisputeModel.findOne as jest.Mock).mockResolvedValue(dispute);

    const res = await request(app)
      .put(`/api/v1/payments/disputes/${DISPUTE_ID}/resolve`)
      .set('Authorization', `Bearer ${makeToken('CLINIC_ADMIN')}`)
      .send({ status: 'resolved_no_action', resolutionNotes: 'No issue found' });

    expect(res.status).toBe(200);
    expect(dispute.save).toHaveBeenCalled();
  });

  it('returns 400 for invalid status', async () => {
    const res = await request(app)
      .put(`/api/v1/payments/disputes/${DISPUTE_ID}/resolve`)
      .set('Authorization', `Bearer ${makeToken('CLINIC_ADMIN')}`)
      .send({ status: 'invalid_status' });

    expect(res.status).toBe(400);
  });

  it('returns 400 when dispute is already closed', async () => {
    (PaymentDisputeModel.findOne as jest.Mock).mockResolvedValue({ ...mockDispute, status: 'closed' });

    const res = await request(app)
      .put(`/api/v1/payments/disputes/${DISPUTE_ID}/resolve`)
      .set('Authorization', `Bearer ${makeToken('CLINIC_ADMIN')}`)
      .send({ status: 'resolved_no_action' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/already closed/i);
  });
});

describe('POST /api/v1/payments/disputes/:id/refund — Issue refund', () => {
  beforeEach(() => jest.clearAllMocks());

  it('issues a full refund successfully', async () => {
    const dispute = { ...mockDispute, status: 'open', refundIntentId: undefined, save: jest.fn().mockResolvedValue(undefined) };
    (PaymentDisputeModel.findOne as jest.Mock).mockResolvedValue(dispute);
    (PaymentRecordModel.findOne as jest.Mock).mockResolvedValue(mockPayment);
    (stellarClient.issueRefund as jest.Mock).mockResolvedValue({ transactionHash: 'tx-hash-abc' });
    (PaymentRecordModel.create as jest.Mock).mockResolvedValue({ intentId: 'refund-intent-1' });

    const res = await request(app)
      .post(`/api/v1/payments/disputes/${DISPUTE_ID}/refund`)
      .set('Authorization', `Bearer ${makeToken('CLINIC_ADMIN')}`)
      .send({ amount: '50.00', destinationPublicKey: 'GDEST123' });

    expect(res.status).toBe(200);
    expect(res.body.data.transactionHash).toBe('tx-hash-abc');
    expect(stellarClient.issueRefund).toHaveBeenCalledWith('GDEST123', '50', expect.any(String));
  });

  it('issues a partial refund', async () => {
    const dispute = { ...mockDispute, status: 'open', refundIntentId: undefined, save: jest.fn().mockResolvedValue(undefined) };
    (PaymentDisputeModel.findOne as jest.Mock).mockResolvedValue(dispute);
    (PaymentRecordModel.findOne as jest.Mock).mockResolvedValue(mockPayment);
    (stellarClient.issueRefund as jest.Mock).mockResolvedValue({ transactionHash: 'tx-partial' });
    (PaymentRecordModel.create as jest.Mock).mockResolvedValue({ intentId: 'refund-partial-1' });

    const res = await request(app)
      .post(`/api/v1/payments/disputes/${DISPUTE_ID}/refund`)
      .set('Authorization', `Bearer ${makeToken('CLINIC_ADMIN')}`)
      .send({ amount: '25.00', destinationPublicKey: 'GDEST123' });

    expect(res.status).toBe(200);
    expect(stellarClient.issueRefund).toHaveBeenCalledWith('GDEST123', '25', expect.any(String));
  });

  it('rejects refund when amount exceeds original payment', async () => {
    const dispute = { ...mockDispute, status: 'open', refundIntentId: undefined, save: jest.fn() };
    (PaymentDisputeModel.findOne as jest.Mock).mockResolvedValue(dispute);
    (PaymentRecordModel.findOne as jest.Mock).mockResolvedValue(mockPayment);

    const res = await request(app)
      .post(`/api/v1/payments/disputes/${DISPUTE_ID}/refund`)
      .set('Authorization', `Bearer ${makeToken('CLINIC_ADMIN')}`)
      .send({ amount: '100.00', destinationPublicKey: 'GDEST123' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Refund amount/);
    expect(stellarClient.issueRefund).not.toHaveBeenCalled();
  });

  it('rejects refund when 30-day window has expired', async () => {
    const oldDate = new Date();
    oldDate.setDate(oldDate.getDate() - 31);
    const dispute = { ...mockDispute, status: 'open', refundIntentId: undefined, save: jest.fn() };
    (PaymentDisputeModel.findOne as jest.Mock).mockResolvedValue(dispute);
    (PaymentRecordModel.findOne as jest.Mock).mockResolvedValue({ ...mockPayment, createdAt: oldDate });

    const res = await request(app)
      .post(`/api/v1/payments/disputes/${DISPUTE_ID}/refund`)
      .set('Authorization', `Bearer ${makeToken('CLINIC_ADMIN')}`)
      .send({ amount: '10.00', destinationPublicKey: 'GDEST123' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Refund window expired/);
    expect(stellarClient.issueRefund).not.toHaveBeenCalled();
  });

  it('returns 409 when refund already issued', async () => {
    (PaymentDisputeModel.findOne as jest.Mock).mockResolvedValue({ ...mockDispute, refundIntentId: 'existing-refund' });

    const res = await request(app)
      .post(`/api/v1/payments/disputes/${DISPUTE_ID}/refund`)
      .set('Authorization', `Bearer ${makeToken('CLINIC_ADMIN')}`)
      .send({ amount: '10.00', destinationPublicKey: 'GDEST123' });

    expect(res.status).toBe(409);
  });
});
