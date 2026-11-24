/**
 * Integration tests for account lockout behavior:
 *   - failed login attempt tracking
 *   - lockout enforcement after MAX_FAILED_ATTEMPTS
 *   - lockout notification email
 *   - audit log entries for lockout/unlock
 *   - POST /api/v1/auth/unlock (SUPER_ADMIN manual unlock)
 */

// ── Environment stubs (must be before any module that reads process.env) ──────
process.env.MONGO_URI = 'mongodb://localhost:27017/test';
process.env.JWT_ACCESS_TOKEN_SECRET = 'test-access-secret-32-chars-long!!';
process.env.JWT_REFRESH_TOKEN_SECRET = 'test-refresh-secret-32-chars-long!';
process.env.API_PORT = '3001';

// ── Mocks (must be before imports) ────────────────────────────────────────────

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
jest.mock('@api/lib/email.service', () => ({
  sendVerificationEmail: jest.fn().mockResolvedValue(undefined),
  sendPasswordResetEmail: jest.fn().mockResolvedValue(undefined),
  sendAccountLockedEmail: jest.fn().mockResolvedValue(undefined),
  sendWelcomeEmail: jest.fn().mockResolvedValue(undefined),
  sendMfaBackupCodesRegeneratedEmail: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('@api/modules/audit/audit.service', () => ({
  auditLog: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@api/modules/auth/models/user.model', () => ({
  UserModel: {
    findOne: jest.fn(),
    findById: jest.fn(),
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
  totpService: {
    setup: jest.fn(),
    verify: jest.fn(),
  },
}));

// Mock the rate-limit middleware so the auth limiter doesn't block test requests
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

// ── Imports ───────────────────────────────────────────────────────────────────

import express from 'express';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { authRoutes } from '@api/modules/auth/auth.controller';
import { UserModel } from '@api/modules/auth/models/user.model';
import { sendAccountLockedEmail } from '@api/lib/email.service';
import { auditLog } from '@api/modules/audit/audit.service';

// This suite exercises only the /auth routes directly (rather than importing
// the full app from '@api/app'), so it stays isolated from unrelated domain
// modules (patients, payments, schedules, etc.) pulled in by the full app.
const app = express();
app.use(express.json());
app.use('/api/v1/auth', authRoutes);

// ── Helpers ───────────────────────────────────────────────────────────────────

const CLINIC_ID = '507f1f77bcf86cd799439011';
const USER_ID = '507f1f77bcf86cd799439022';
const ADMIN_ID = '507f1f77bcf86cd799439099';

function makeUser(overrides: Record<string, unknown> = {}) {
  return {
    id: USER_ID,
    _id: USER_ID,
    email: 'doctor@clinic.com',
    fullName: 'Dr. Test',
    password: '$2a$12$hashedpassword',
    role: 'DOCTOR',
    clinicId: CLINIC_ID,
    isActive: true,
    mfaEnabled: false,
    failedLoginAttempts: 0,
    failedMfaAttempts: 0,
    lockedUntil: undefined as Date | undefined,
    preferences: { language: 'en' },
    save: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function makeAdminToken(): string {
  return jwt.sign(
    { userId: ADMIN_ID, role: 'SUPER_ADMIN', clinicId: CLINIC_ID },
    'test-access-secret-32-chars-long!!',
    {
      expiresIn: '15m',
      issuer: 'health-watchers-api',
      audience: 'health-watchers-client',
      jwtid: 'admin-jti-1',
    }
  );
}

function makeNonAdminToken(): string {
  return jwt.sign(
    { userId: USER_ID, role: 'DOCTOR', clinicId: CLINIC_ID },
    'test-access-secret-32-chars-long!!',
    {
      expiresIn: '15m',
      issuer: 'health-watchers-api',
      audience: 'health-watchers-client',
      jwtid: 'doctor-jti-1',
    }
  );
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Account lockout', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('Failed attempt tracking', () => {
    it('increments failedLoginAttempts on wrong password', async () => {
      const user = makeUser({ failedLoginAttempts: 2 });
      (UserModel.findOne as jest.Mock).mockResolvedValue(user);
      jest.spyOn(bcrypt, 'compare').mockResolvedValue(false as never);

      await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'doctor@clinic.com', password: 'WrongPass1!' });

      expect(user.failedLoginAttempts).toBe(3);
      expect(user.lockedUntil).toBeUndefined();
      expect(user.save).toHaveBeenCalled();
    });

    it('resets failedLoginAttempts and lockedUntil on successful login', async () => {
      const user = makeUser({ failedLoginAttempts: 3 });
      (UserModel.findOne as jest.Mock).mockResolvedValue(user);
      jest.spyOn(bcrypt, 'compare').mockResolvedValue(true as never);

      await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'doctor@clinic.com', password: 'CorrectPass1!' });

      expect(user.failedLoginAttempts).toBe(0);
      expect(user.lockedUntil).toBeUndefined();
    });
  });

  describe('Lockout enforcement', () => {
    it('locks the account and returns 423 once MAX_FAILED_ATTEMPTS is reached', async () => {
      const user = makeUser({ failedLoginAttempts: 4 });
      (UserModel.findOne as jest.Mock).mockResolvedValue(user);
      jest.spyOn(bcrypt, 'compare').mockResolvedValue(false as never);

      await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'doctor@clinic.com', password: 'WrongPass1!' });

      expect(user.failedLoginAttempts).toBe(5);
      expect(user.lockedUntil).toBeInstanceOf(Date);
      expect(user.lockedUntil!.getTime()).toBeGreaterThan(Date.now());
    });

    it('rejects login attempts with 423 + Retry-After while locked, without checking the password', async () => {
      const lockedUntil = new Date(Date.now() + 10 * 60 * 1000);
      const user = makeUser({ lockedUntil });
      (UserModel.findOne as jest.Mock).mockResolvedValue(user);
      const compareSpy = jest.spyOn(bcrypt, 'compare');

      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'doctor@clinic.com', password: 'AnyPass1!' });

      expect(res.status).toBe(423);
      expect(res.body.error).toBe('AccountLocked');
      expect(res.body).toHaveProperty('retryAfter');
      expect(res.headers).toHaveProperty('retry-after');
      expect(compareSpy).not.toHaveBeenCalled();
    });
  });

  describe('Lockout notification', () => {
    it('sends an account-locked email when the account transitions to locked', async () => {
      const user = makeUser({ failedLoginAttempts: 4 });
      (UserModel.findOne as jest.Mock).mockResolvedValue(user);
      jest.spyOn(bcrypt, 'compare').mockResolvedValue(false as never);

      await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'doctor@clinic.com', password: 'WrongPass1!' });

      expect(sendAccountLockedEmail).toHaveBeenCalledWith(
        user.email,
        user.fullName,
        expect.any(Number),
        user.preferences.language
      );
    });

    it('does not send an email for failed attempts below the threshold', async () => {
      const user = makeUser({ failedLoginAttempts: 0 });
      (UserModel.findOne as jest.Mock).mockResolvedValue(user);
      jest.spyOn(bcrypt, 'compare').mockResolvedValue(false as never);

      await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'doctor@clinic.com', password: 'WrongPass1!' });

      expect(sendAccountLockedEmail).not.toHaveBeenCalled();
    });
  });

  describe('Audit logging', () => {
    it('writes an ACCOUNT_LOCKED audit entry when the account is locked', async () => {
      const user = makeUser({ failedLoginAttempts: 4 });
      (UserModel.findOne as jest.Mock).mockResolvedValue(user);
      jest.spyOn(bcrypt, 'compare').mockResolvedValue(false as never);

      await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'doctor@clinic.com', password: 'WrongPass1!' });

      expect(auditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'ACCOUNT_LOCKED',
          userId: USER_ID,
          metadata: expect.objectContaining({ email: user.email }),
        }),
        expect.anything()
      );
    });

    it('does not write an audit entry for failed attempts below the threshold', async () => {
      const user = makeUser({ failedLoginAttempts: 0 });
      (UserModel.findOne as jest.Mock).mockResolvedValue(user);
      jest.spyOn(bcrypt, 'compare').mockResolvedValue(false as never);

      await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'doctor@clinic.com', password: 'WrongPass1!' });

      expect(auditLog).not.toHaveBeenCalled();
    });
  });

  describe('POST /api/v1/auth/unlock', () => {
    it('returns 401 without a valid token', async () => {
      const res = await request(app)
        .post('/api/v1/auth/unlock')
        .send({ email: 'doctor@clinic.com' });

      expect(res.status).toBe(401);
    });

    it('returns 403 when the caller is not a SUPER_ADMIN', async () => {
      const res = await request(app)
        .post('/api/v1/auth/unlock')
        .set('Authorization', `Bearer ${makeNonAdminToken()}`)
        .send({ email: 'doctor@clinic.com' });

      expect(res.status).toBe(403);
      expect(res.body.error).toBe('Forbidden');
    });

    it('returns 404 when the target user does not exist', async () => {
      (UserModel.findOne as jest.Mock).mockResolvedValue(null);

      const res = await request(app)
        .post('/api/v1/auth/unlock')
        .set('Authorization', `Bearer ${makeAdminToken()}`)
        .send({ email: 'nobody@nowhere.com' });

      expect(res.status).toBe(404);
    });

    it('resets failedLoginAttempts, failedMfaAttempts and lockedUntil for a SUPER_ADMIN caller', async () => {
      const user = makeUser({
        failedLoginAttempts: 5,
        failedMfaAttempts: 3,
        lockedUntil: new Date(Date.now() + 10 * 60 * 1000),
      });
      (UserModel.findOne as jest.Mock).mockResolvedValue(user);

      const res = await request(app)
        .post('/api/v1/auth/unlock')
        .set('Authorization', `Bearer ${makeAdminToken()}`)
        .send({ email: user.email });

      expect(res.status).toBe(200);
      expect(res.body.data).toEqual({ unlocked: true, email: user.email });
      expect(user.failedLoginAttempts).toBe(0);
      expect(user.failedMfaAttempts).toBe(0);
      expect(user.lockedUntil).toBeUndefined();
      expect(user.save).toHaveBeenCalled();
    });

    it('writes an ACCOUNT_UNLOCKED audit entry', async () => {
      const user = makeUser({
        failedLoginAttempts: 5,
        lockedUntil: new Date(Date.now() + 10 * 60 * 1000),
      });
      (UserModel.findOne as jest.Mock).mockResolvedValue(user);

      await request(app)
        .post('/api/v1/auth/unlock')
        .set('Authorization', `Bearer ${makeAdminToken()}`)
        .send({ email: user.email });

      expect(auditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'ACCOUNT_UNLOCKED',
          userId: USER_ID,
          metadata: expect.objectContaining({ email: user.email }),
        }),
        expect.anything()
      );
    });
  });
});
