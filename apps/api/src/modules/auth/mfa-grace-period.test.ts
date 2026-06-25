/**
 * Tests for MFA grace period enforcement on DOCTOR and NURSE roles (Issue #701).
 */

// ── Environment stubs ─────────────────────────────────────────────────────────
process.env.MONGO_URI = 'mongodb://localhost:27017/test';
process.env.JWT_ACCESS_TOKEN_SECRET = 'test-access-secret-32-chars-long!!';
process.env.JWT_REFRESH_TOKEN_SECRET = 'test-refresh-secret-32-chars-long!';
process.env.API_PORT = '3001';

// ── Mocks ─────────────────────────────────────────────────────────────────────
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
    horizonUrl: '',
    secretKey: '',
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
  sendMfaGracePeriodReminderEmail: jest.fn(),
}));

jest.mock('@api/modules/auth/models/user.model', () => ({
  UserModel: {
    findOne: jest.fn(),
    findById: jest.fn(),
    find: jest.fn(),
    create: jest.fn(),
  },
}));

jest.mock('@api/modules/auth/models/refresh-token.model', () => ({
  RefreshTokenModel: {
    findOne: jest.fn(),
    create: jest.fn(),
    deleteOne: jest.fn(),
    deleteMany: jest.fn(),
  },
}));

jest.mock('@api/modules/auth/totp.service', () => ({
  totpService: { setup: jest.fn(), verify: jest.fn() },
}));

jest.mock('@api/middlewares/rate-limit.middleware', () => {
  const pass = (_req: unknown, _res: unknown, next: () => void) => next();
  return {
    authLimiter: pass,
    forgotPasswordLimiter: pass,
    aiLimiter: pass,
    paymentLimiter: pass,
    generalLimiter: pass,
  };
});

// ── Imports ───────────────────────────────────────────────────────────────────
import request from 'supertest';
import bcrypt from 'bcryptjs';
import app from '@api/app';
import { UserModel } from '@api/modules/auth/models/user.model';
import { RefreshTokenModel } from '@api/modules/auth/models/refresh-token.model';
import { sendMfaGracePeriodReminderEmail } from '@api/lib/email.service';
import { runMfaGracePeriodReminderTick } from './mfa-grace-period-job';

// ── Helpers ───────────────────────────────────────────────────────────────────
const CLINIC_ID = '507f1f77bcf86cd799439011';
const USER_ID = '507f1f77bcf86cd799439022';

function makeUser(overrides: Record<string, unknown> = {}) {
  return {
    id: USER_ID,
    _id: USER_ID,
    email: 'doctor@clinic.com',
    fullName: 'Dr. House',
    password: '$2a$12$hashedpassword',
    role: 'DOCTOR',
    clinicId: CLINIC_ID,
    isActive: true,
    mfaEnabled: false,
    failedLoginAttempts: 0,
    lockedUntil: undefined as Date | undefined,
    mfaGracePeriodEndsAt: undefined as Date | undefined,
    save: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────
describe('MFA grace period enforcement — DOCTOR and NURSE roles', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(bcrypt, 'compare').mockResolvedValue(true as never);
    (RefreshTokenModel.create as jest.Mock).mockResolvedValue({});
  });

  // ── DOCTOR and NURSE added to MFA_REQUIRED_ROLES ──────────────────────────

  it('assigns a grace period on first login for DOCTOR without mfaGracePeriodEndsAt', async () => {
    const user = makeUser({ role: 'DOCTOR' });
    (UserModel.findOne as jest.Mock).mockResolvedValue(user);

    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'doctor@clinic.com', password: 'ValidPass1!' });

    expect(user.save).toHaveBeenCalled();
    expect(user.mfaGracePeriodEndsAt).toBeInstanceOf(Date);
    expect(user.mfaGracePeriodEndsAt!.getTime()).toBeGreaterThan(Date.now());
    // Login succeeds with a warning
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('success');
    expect(res.body.data.warning).toBe('mfa_required');
    expect(res.body.data).toHaveProperty('mfaGracePeriodEndsAt');
  });

  it('assigns a grace period on first login for NURSE without mfaGracePeriodEndsAt', async () => {
    const user = makeUser({ role: 'NURSE', email: 'nurse@clinic.com' });
    (UserModel.findOne as jest.Mock).mockResolvedValue(user);

    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'nurse@clinic.com', password: 'ValidPass1!' });

    expect(res.status).toBe(200);
    expect(res.body.data.warning).toBe('mfa_required');
    expect(user.mfaGracePeriodEndsAt).toBeInstanceOf(Date);
  });

  it('allows login during active grace period and returns tokens + warning', async () => {
    const gracePeriodEndsAt = new Date(Date.now() + 4 * 24 * 60 * 60 * 1000); // 4 days away
    const user = makeUser({ mfaGracePeriodEndsAt: gracePeriodEndsAt });
    (UserModel.findOne as jest.Mock).mockResolvedValue(user);

    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'doctor@clinic.com', password: 'ValidPass1!' });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('success');
    expect(res.body.data).toHaveProperty('accessToken');
    expect(res.body.data).toHaveProperty('refreshToken');
    expect(res.body.data.warning).toBe('mfa_required');
    expect(res.body.data).toHaveProperty('mfaGracePeriodEndsAt');
  });

  it('blocks login after grace period expires and returns 403 with tempToken', async () => {
    const gracePeriodEndsAt = new Date(Date.now() - 60 * 1000); // 1 minute ago
    const user = makeUser({ mfaGracePeriodEndsAt: gracePeriodEndsAt });
    (UserModel.findOne as jest.Mock).mockResolvedValue(user);

    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'doctor@clinic.com', password: 'ValidPass1!' });

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('MfaRequired');
    expect(res.body.requiresMfaSetup).toBe(true);
    expect(res.body).toHaveProperty('tempToken');
    expect(typeof res.body.tempToken).toBe('string');
  });

  it('blocks NURSE login after grace period expires', async () => {
    const gracePeriodEndsAt = new Date(Date.now() - 1000);
    const user = makeUser({ role: 'NURSE', email: 'nurse@clinic.com', mfaGracePeriodEndsAt: gracePeriodEndsAt });
    (UserModel.findOne as jest.Mock).mockResolvedValue(user);

    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'nurse@clinic.com', password: 'ValidPass1!' });

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('MfaRequired');
  });

  it('does not block DOCTOR login once MFA is enabled (proceeds to mfa_required challenge)', async () => {
    const user = makeUser({ mfaEnabled: true });
    (UserModel.findOne as jest.Mock).mockResolvedValue(user);

    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'doctor@clinic.com', password: 'ValidPass1!' });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('mfa_required');
    expect(res.body.data.mfaRequired).toBe(true);
  });

  it('does not apply grace period logic to ASSISTANT role', async () => {
    const user = makeUser({ role: 'ASSISTANT' });
    (UserModel.findOne as jest.Mock).mockResolvedValue(user);

    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'doctor@clinic.com', password: 'ValidPass1!' });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('success');
    expect(res.body.data.warning).toBeUndefined();
  });
});

// ── MFA grace period reminder job ─────────────────────────────────────────────
describe('runMfaGracePeriodReminderTick', () => {
  beforeEach(() => jest.clearAllMocks());

  it('sends a 3-day reminder to users whose grace period ends in ~3 days', async () => {
    const threeDays = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000 - 30 * 60 * 1000); // 30min inside window
    const user = { id: USER_ID, email: 'doctor@clinic.com', fullName: 'Dr. House', mfaGracePeriodEndsAt: threeDays };

    (UserModel.find as jest.Mock)
      .mockResolvedValueOnce([user]) // 3-day window
      .mockResolvedValueOnce([]);    // 1-day window

    await runMfaGracePeriodReminderTick();

    expect(sendMfaGracePeriodReminderEmail).toHaveBeenCalledWith(
      user.email,
      user.fullName,
      3,
      threeDays
    );
  });

  it('sends a 1-day reminder to users whose grace period ends in ~1 day', async () => {
    const oneDay = new Date(Date.now() + 1 * 24 * 60 * 60 * 1000 - 30 * 60 * 1000);
    const user = { id: USER_ID, email: 'nurse@clinic.com', fullName: 'Nurse Joy', mfaGracePeriodEndsAt: oneDay };

    (UserModel.find as jest.Mock)
      .mockResolvedValueOnce([])      // 3-day window
      .mockResolvedValueOnce([user]); // 1-day window

    await runMfaGracePeriodReminderTick();

    expect(sendMfaGracePeriodReminderEmail).toHaveBeenCalledWith(
      user.email,
      user.fullName,
      1,
      oneDay
    );
  });

  it('sends no emails when no users are in a reminder window', async () => {
    (UserModel.find as jest.Mock).mockResolvedValue([]);

    await runMfaGracePeriodReminderTick();

    expect(sendMfaGracePeriodReminderEmail).not.toHaveBeenCalled();
  });
});
