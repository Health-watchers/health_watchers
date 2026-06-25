/**
 * Tests for the extended dispute resolution workflow (#637):
 * POST /api/v1/payments/disputes/:disputeId/evidence
 * PUT  /api/v1/payments/disputes/:id/resolve  (review period + auto-refund)
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
  sendDisputeEvidenceSubmittedEmail: jest.fn(),
  sendPaymentConfirmationEmail: jest.fn(),
}));

import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '@api/app';
import { PaymentRecordModel } from './models/payment-record.model';
import { PaymentDisputeModel } from './models/payment-dispute.model';
import { stellarClient } from './services/stellar-client';
import { sendDisputeEvidenceSubmittedEmail } from '@api/lib/email.service';

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

function makeDispute(overrides: Record<string, unknown> = {}) {
  return {
    _id: DISPUTE_ID,
    paymentIntentId: INTENT_ID,
    clinicId: CLINIC_ID,
    patientId: 'patient-1',
    reason: 'duplicate_payment',
    description: 'Charged twice',
    status: 'open',
    openedBy: USER_ID,
    openedAt: new Date(),
    evidence: [],
    evidenceSubmittedAt: undefined,
    reviewDeadline: undefined,
    refundIntentId: undefined,
    save: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe('POST /api/v1/payments/disputes/:disputeId/evidence', () => {
  beforeEach(() => jest.clearAllMocks());

  it('records evidence and starts the 7-day review period', async () => {
    const dispute = makeDispute();
    (PaymentDisputeModel.findOne as jest.Mock).mockResolvedValue(dispute);

    const res = await request(app)
      .post(`/api/v1/payments/disputes/${DISPUTE_ID}/evidence`)
      .set('Authorization', `Bearer ${makeToken('CLINIC_ADMIN')}`)
      .send({ description: 'Receipt showing single charge', attachmentUrl: 'https://x/y.pdf' });

    expect(res.status).toBe(200);
    expect(dispute.evidence).toHaveLength(1);
    expect(dispute.status).toBe('evidence_submitted');
    expect(dispute.reviewDeadline).toBeInstanceOf(Date);
    expect(res.body.data.reviewDeadline).toBeDefined();
    expect(dispute.save).toHaveBeenCalled();
    expect(sendDisputeEvidenceSubmittedEmail).toHaveBeenCalled();
  });

  it('rejects evidence with no description', async () => {
    const res = await request(app)
      .post(`/api/v1/payments/disputes/${DISPUTE_ID}/evidence`)
      .set('Authorization', `Bearer ${makeToken('CLINIC_ADMIN')}`)
      .send({ attachmentUrl: 'https://x/y.pdf' });

    expect(res.status).toBe(400);
  });

  it('rejects evidence on a closed dispute', async () => {
    (PaymentDisputeModel.findOne as jest.Mock).mockResolvedValue(makeDispute({ status: 'closed' }));

    const res = await request(app)
      .post(`/api/v1/payments/disputes/${DISPUTE_ID}/evidence`)
      .set('Authorization', `Bearer ${makeToken('CLINIC_ADMIN')}`)
      .send({ description: 'too late' });

    expect(res.status).toBe(400);
  });

  it('returns 404 when dispute not found', async () => {
    (PaymentDisputeModel.findOne as jest.Mock).mockResolvedValue(null);

    const res = await request(app)
      .post(`/api/v1/payments/disputes/${DISPUTE_ID}/evidence`)
      .set('Authorization', `Bearer ${makeToken('CLINIC_ADMIN')}`)
      .send({ description: 'evidence' });

    expect(res.status).toBe(404);
  });
});

describe('PUT /api/v1/payments/disputes/:id/resolve — review period & auto-refund', () => {
  beforeEach(() => jest.clearAllMocks());

  it('blocks resolution while the review period is still active (non-super-admin)', async () => {
    const future = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
    (PaymentDisputeModel.findOne as jest.Mock).mockResolvedValue(
      makeDispute({ status: 'evidence_submitted', reviewDeadline: future })
    );

    const res = await request(app)
      .put(`/api/v1/payments/disputes/${DISPUTE_ID}/resolve`)
      .set('Authorization', `Bearer ${makeToken('CLINIC_ADMIN')}`)
      .send({ status: 'resolved_no_action' });

    expect(res.status).toBe(425);
    expect(res.body.error).toMatch(/review period/i);
  });

  it('allows SUPER_ADMIN to resolve during the review period', async () => {
    const future = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
    const dispute = makeDispute({ status: 'evidence_submitted', reviewDeadline: future });
    (PaymentDisputeModel.findOne as jest.Mock).mockResolvedValue(dispute);

    const res = await request(app)
      .put(`/api/v1/payments/disputes/${DISPUTE_ID}/resolve`)
      .set('Authorization', `Bearer ${makeToken('SUPER_ADMIN')}`)
      .send({ status: 'resolved_no_action', resolutionNotes: 'override' });

    expect(res.status).toBe(200);
    expect(dispute.save).toHaveBeenCalled();
  });

  it('auto-processes a refund when resolved in the patient favor', async () => {
    const dispute = makeDispute({ status: 'evidence_submitted', reviewDeadline: undefined });
    (PaymentDisputeModel.findOne as jest.Mock).mockResolvedValue(dispute);
    (PaymentRecordModel.findOne as jest.Mock).mockResolvedValue(mockPayment);
    (stellarClient.issueRefund as jest.Mock).mockResolvedValue({ transactionHash: 'tx-auto-refund' });
    (PaymentRecordModel.create as jest.Mock).mockResolvedValue({ intentId: 'refund-auto' });

    const res = await request(app)
      .put(`/api/v1/payments/disputes/${DISPUTE_ID}/resolve`)
      .set('Authorization', `Bearer ${makeToken('CLINIC_ADMIN')}`)
      .send({ status: 'resolved_refund', refundAmount: '50.00', refundDestination: 'GDEST123' });

    expect(res.status).toBe(200);
    expect(stellarClient.issueRefund).toHaveBeenCalledWith('GDEST123', '50', expect.any(String));
    expect(res.body.data.transactionHash).toBe('tx-auto-refund');
    expect(dispute.refundIntentId).toBeDefined();
    expect(dispute.status).toBe('resolved_refund');
  });

  it('resolves without a refund when no refund details are supplied', async () => {
    const dispute = makeDispute({ status: 'under_review', reviewDeadline: undefined });
    (PaymentDisputeModel.findOne as jest.Mock).mockResolvedValue(dispute);

    const res = await request(app)
      .put(`/api/v1/payments/disputes/${DISPUTE_ID}/resolve`)
      .set('Authorization', `Bearer ${makeToken('CLINIC_ADMIN')}`)
      .send({ status: 'resolved_no_action', resolutionNotes: 'no issue' });

    expect(res.status).toBe(200);
    expect(stellarClient.issueRefund).not.toHaveBeenCalled();
    expect(dispute.resolution.outcome).toBe('clinic_favored');
  });
});
