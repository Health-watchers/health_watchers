/**
 * Unit tests for /api/v1/pre-auth endpoints
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

// Stub all unrelated route modules
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

jest.mock('@api/modules/pre-auth/pre-auth.model', () => ({
  PreAuthModel: {
    create: jest.fn(),
    findOne: jest.fn(),
    find: jest.fn(),
  },
}));

jest.mock('@api/modules/payments/services/stellar-client', () => ({
  stellarClient: {
    verifyTransaction: jest.fn(),
    findPaths: jest.fn(),
    getOrderbook: jest.fn(),
    getFeeEstimate: jest.fn(),
    createClaimableBalance: jest.fn(),
    claimBalance: jest.fn(),
    reclaimBalance: jest.fn(),
  },
}));

import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '@api/app';
import { PreAuthModel } from './pre-auth.model';
import { stellarClient } from '@api/modules/payments/services/stellar-client';

function makeToken(role = 'CLINIC_ADMIN') {
  return jwt.sign(
    { userId: '507f1f77bcf86cd799439011', role, clinicId: 'clinic-abc' },
    'test-access-secret',
    { expiresIn: '15m', issuer: 'health-watchers-api', audience: 'health-watchers-client' }
  );
}

const adminToken = makeToken('CLINIC_ADMIN');
const doctorToken = makeToken('DOCTOR');

const mockPreAuth = {
  _id: '507f1f77bcf86cd799439020',
  patientId: '507f1f77bcf86cd799439030',
  clinicId: 'clinic-abc',
  procedureCode: '99213',
  estimatedAmount: '50.00',
  insuranceProvider: 'BlueCross',
  status: 'pending',
  claimableBalanceId: 'cb_abc123',
  expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
  save: jest.fn().mockResolvedValue(undefined),
  toObject: jest.fn().mockReturnThis(),
};

beforeEach(() => jest.clearAllMocks());

// ── POST /pre-auth ────────────────────────────────────────────────────────────

describe('POST /api/v1/pre-auth', () => {
  it('creates a pre-auth and claimable balance', async () => {
    (stellarClient.createClaimableBalance as jest.Mock).mockResolvedValue({ balanceId: 'cb_abc123' });
    (PreAuthModel.create as jest.Mock).mockResolvedValue(mockPreAuth);

    const res = await request(app)
      .post('/api/v1/pre-auth')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        patientId: '507f1f77bcf86cd799439030',
        procedureCode: '99213',
        estimatedAmount: '50.00',
        insuranceProvider: 'BlueCross',
        patientPublicKey: 'GPATIENT123',
      });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe('success');
    expect(stellarClient.createClaimableBalance).toHaveBeenCalledWith(
      expect.objectContaining({ amount: '50.00', fromPublicKey: 'GPATIENT123' })
    );
  });

  it('returns 502 when stellar service fails', async () => {
    (stellarClient.createClaimableBalance as jest.Mock).mockRejectedValue(new Error('Horizon down'));

    const res = await request(app)
      .post('/api/v1/pre-auth')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        patientId: '507f1f77bcf86cd799439030',
        procedureCode: '99213',
        estimatedAmount: '50.00',
        insuranceProvider: 'BlueCross',
        patientPublicKey: 'GPATIENT123',
      });

    expect(res.status).toBe(502);
    expect(res.body.error).toBe('StellarServiceError');
  });

  it('returns 400 on missing required fields', async () => {
    const res = await request(app)
      .post('/api/v1/pre-auth')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ procedureCode: '99213' }); // missing patientId, estimatedAmount, etc.

    expect(res.status).toBe(400);
  });
});

// ── PUT /pre-auth/:id/approve ─────────────────────────────────────────────────

describe('PUT /api/v1/pre-auth/:id/approve', () => {
  it('approves a pending pre-auth', async () => {
    const pa = { ...mockPreAuth, status: 'pending', save: jest.fn() };
    (PreAuthModel.findOne as jest.Mock).mockResolvedValue(pa);

    const res = await request(app)
      .put(`/api/v1/pre-auth/${mockPreAuth._id}/approve`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ preAuthNumber: 'PA-001' });

    expect(res.status).toBe(200);
    expect(pa.save).toHaveBeenCalled();
    expect(pa.status).toBe('approved');
    expect(pa.preAuthNumber).toBe('PA-001');
  });

  it('returns 409 when pre-auth is already approved', async () => {
    (PreAuthModel.findOne as jest.Mock).mockResolvedValue({ ...mockPreAuth, status: 'approved' });

    const res = await request(app)
      .put(`/api/v1/pre-auth/${mockPreAuth._id}/approve`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ preAuthNumber: 'PA-002' });

    expect(res.status).toBe(409);
  });

  it('returns 403 for non-admin roles', async () => {
    const res = await request(app)
      .put(`/api/v1/pre-auth/${mockPreAuth._id}/approve`)
      .set('Authorization', `Bearer ${doctorToken}`)
      .send({ preAuthNumber: 'PA-003' });

    expect(res.status).toBe(403);
  });
});

// ── POST /pre-auth/:id/claim ──────────────────────────────────────────────────

describe('POST /api/v1/pre-auth/:id/claim', () => {
  it('claims funds after approval', async () => {
    const pa = { ...mockPreAuth, status: 'approved', save: jest.fn(), toObject: jest.fn().mockReturnThis() };
    (PreAuthModel.findOne as jest.Mock).mockResolvedValue(pa);
    (stellarClient.claimBalance as jest.Mock).mockResolvedValue({ txHash: 'tx_claim_abc' });

    const res = await request(app)
      .post(`/api/v1/pre-auth/${mockPreAuth._id}/claim`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(pa.status).toBe('claimed');
    expect(stellarClient.claimBalance).toHaveBeenCalledWith('cb_abc123');
  });

  it('returns 409 when pre-auth is not approved', async () => {
    (PreAuthModel.findOne as jest.Mock).mockResolvedValue({ ...mockPreAuth, status: 'pending' });

    const res = await request(app)
      .post(`/api/v1/pre-auth/${mockPreAuth._id}/claim`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(409);
    expect(stellarClient.claimBalance).not.toHaveBeenCalled();
  });
});

// ── POST /pre-auth/:id/deny ───────────────────────────────────────────────────

describe('POST /api/v1/pre-auth/:id/deny', () => {
  it('denies and triggers patient reclaim', async () => {
    const pa = { ...mockPreAuth, status: 'pending', save: jest.fn(), toObject: jest.fn().mockReturnThis() };
    (PreAuthModel.findOne as jest.Mock).mockResolvedValue(pa);
    (stellarClient.reclaimBalance as jest.Mock).mockResolvedValue({ txHash: 'tx_reclaim_abc' });

    const res = await request(app)
      .post(`/api/v1/pre-auth/${mockPreAuth._id}/deny`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(pa.status).toBe('denied');
    expect(stellarClient.reclaimBalance).toHaveBeenCalledWith('cb_abc123');
  });

  it('returns 409 when pre-auth is already claimed', async () => {
    (PreAuthModel.findOne as jest.Mock).mockResolvedValue({ ...mockPreAuth, status: 'claimed' });

    const res = await request(app)
      .post(`/api/v1/pre-auth/${mockPreAuth._id}/deny`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(409);
    expect(stellarClient.reclaimBalance).not.toHaveBeenCalled();
  });
});

// ── Expiry ────────────────────────────────────────────────────────────────────

describe('Pre-auth expiry', () => {
  it('returns 410 when approving an expired pre-auth', async () => {
    const expired = {
      ...mockPreAuth,
      status: 'pending',
      expiresAt: new Date(Date.now() - 1000), // already expired
    };
    (PreAuthModel.findOne as jest.Mock).mockResolvedValue(expired);

    const res = await request(app)
      .put(`/api/v1/pre-auth/${mockPreAuth._id}/approve`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ preAuthNumber: 'PA-EXP' });

    expect(res.status).toBe(410);
    expect(res.body.error).toBe('Expired');
  });
});
