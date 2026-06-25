/**
 * Integration tests for POST /api/v1/auth/switch-clinic (#635).
 * SUPER_ADMIN users obtain tokens scoped to a different clinic without re-login.
 */

process.env.MONGO_URI = 'mongodb://localhost:27017/test';
process.env.JWT_ACCESS_TOKEN_SECRET = 'test-access-secret-32-chars-long!!';
process.env.JWT_REFRESH_TOKEN_SECRET = 'test-refresh-secret-32-chars-long!';
process.env.API_PORT = '3001';

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
    stellarHorizonUrl: '',
    stellarSecretKey: '',
    stellar: { network: 'testnet', horizonUrl: '', secretKey: '', platformPublicKey: '' },
    supportedAssets: ['XLM'],
    stellarServiceUrl: '',
    geminiApiKey: '',
    fieldEncryptionKey: 'abcdefghijklmnopqrstuvwxyz012345',
  },
}));

jest.mock('@api/modules/patients/patients.controller', () => ({ patientRoutes: require('express').Router() }));
jest.mock('@api/modules/encounters/encounters.controller', () => ({ encounterRoutes: require('express').Router() }));
jest.mock('@api/modules/payments/payments.controller', () => ({ paymentRoutes: require('express').Router() }));
jest.mock('@api/modules/ai/ai.routes', () => require('express').Router());
jest.mock('@api/modules/dashboard/dashboard.routes', () => require('express').Router());
jest.mock('@api/modules/appointments/appointments.controller', () => ({ appointmentRoutes: require('express').Router() }));
jest.mock('@api/modules/clinics/clinics.controller', () => ({ clinicRoutes: require('express').Router() }));
jest.mock('@api/modules/users/users.controller', () => ({ userRoutes: require('express').Router() }));
jest.mock('@api/modules/webhooks/webhooks.controller', () => ({ webhookRoutes: require('express').Router() }));
jest.mock('@api/modules/audit/audit-logs.controller', () => ({ auditLogRoutes: require('express').Router() }));
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
jest.mock('@api/lib/email.service', () => ({
  sendVerificationEmail: jest.fn().mockResolvedValue(undefined),
  sendPasswordResetEmail: jest.fn().mockResolvedValue(undefined),
  sendWelcomeEmail: jest.fn(),
}));
jest.mock('@api/services/token-denylist.service', () => ({
  isDenylisted: jest.fn().mockResolvedValue(false),
  isInvalidatedForUser: jest.fn().mockResolvedValue(false),
  addToDenylist: jest.fn().mockResolvedValue(undefined),
  setUserInvalidatedAt: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('@api/modules/audit/audit.service', () => ({
  auditLog: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('@api/modules/auth/models/user.model', () => ({
  UserModel: { findById: jest.fn() },
}));
jest.mock('@api/modules/clinics/clinic.model', () => ({
  ClinicModel: { findById: jest.fn() },
}));
jest.mock('@api/modules/auth/models/refresh-token.model', () => ({
  RefreshTokenModel: { create: jest.fn().mockResolvedValue({}) },
}));
jest.mock('@api/middlewares/rate-limit.middleware', () => {
  const passThrough = (_req: unknown, _res: unknown, next: () => void) => next();
  return {
    authLimiter: passThrough,
    forgotPasswordLimiter: passThrough,
    aiLimiter: passThrough,
    paymentLimiter: passThrough,
    generalLimiter: passThrough,
  };
});

import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '@api/app';
import { UserModel } from '@api/modules/auth/models/user.model';
import { ClinicModel } from '@api/modules/clinics/clinic.model';
import { auditLog } from '@api/modules/audit/audit.service';

const USER_ID = '507f1f77bcf86cd799439022';
const FROM_CLINIC = '507f1f77bcf86cd799439011';
const TO_CLINIC = '507f1f77bcf86cd7994390ff';

function makeToken(role: string, clinicId = FROM_CLINIC) {
  return jwt.sign(
    { userId: USER_ID, role, clinicId, isSuperAdmin: role === 'SUPER_ADMIN' },
    'test-access-secret-32-chars-long!!',
    { expiresIn: '15m', issuer: 'health-watchers-api', audience: 'health-watchers-client' }
  );
}

describe('POST /api/v1/auth/switch-clinic', () => {
  beforeEach(() => jest.clearAllMocks());

  it('issues new tokens scoped to the selected clinic for a SUPER_ADMIN', async () => {
    (ClinicModel.findById as jest.Mock).mockResolvedValue({ _id: TO_CLINIC, name: 'Clinic B', isActive: true });
    (UserModel.findById as jest.Mock).mockResolvedValue({ id: USER_ID, role: 'SUPER_ADMIN', isActive: true });

    const res = await request(app)
      .post('/api/v1/auth/switch-clinic')
      .set('Authorization', `Bearer ${makeToken('SUPER_ADMIN')}`)
      .send({ clinicId: TO_CLINIC });

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty('accessToken');
    expect(res.body.data).toHaveProperty('refreshToken');
    expect(res.body.data.clinic.id).toBe(TO_CLINIC);

    // New access token must be scoped to the target clinic and keep super-admin identity.
    const decoded = jwt.decode(res.body.data.accessToken) as Record<string, unknown>;
    expect(decoded.clinicId).toBe(TO_CLINIC);
    expect(decoded.isSuperAdmin).toBe(true);
    expect(decoded.role).toBe('SUPER_ADMIN');

    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'CLINIC_SWITCH' }),
      expect.anything()
    );
  });

  it('returns 403 for non-super-admin callers', async () => {
    const res = await request(app)
      .post('/api/v1/auth/switch-clinic')
      .set('Authorization', `Bearer ${makeToken('CLINIC_ADMIN')}`)
      .send({ clinicId: TO_CLINIC });

    expect(res.status).toBe(403);
  });

  it('returns 400 for a missing/invalid clinicId', async () => {
    const res = await request(app)
      .post('/api/v1/auth/switch-clinic')
      .set('Authorization', `Bearer ${makeToken('SUPER_ADMIN')}`)
      .send({ clinicId: 'not-an-objectid' });

    expect(res.status).toBe(400);
  });

  it('returns 404 when the clinic does not exist', async () => {
    (ClinicModel.findById as jest.Mock).mockResolvedValue(null);

    const res = await request(app)
      .post('/api/v1/auth/switch-clinic')
      .set('Authorization', `Bearer ${makeToken('SUPER_ADMIN')}`)
      .send({ clinicId: TO_CLINIC });

    expect(res.status).toBe(404);
  });

  it('returns 401 without an auth token', async () => {
    const res = await request(app).post('/api/v1/auth/switch-clinic').send({ clinicId: TO_CLINIC });
    expect(res.status).toBe(401);
  });
});
