/**
 * Integration tests for:
 *   POST /api/v1/auth/mfa/backup-codes/regenerate
 *   GET  /api/v1/auth/mfa/backup-codes/count
 */

// ── Environment stubs ─────────────────────────────────────────────────────────
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

// Stub out routes not under test
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

const mockSendMfaBackupCodesRegeneratedEmail = jest.fn();
jest.mock('@api/lib/email.service', () => ({
  sendVerificationEmail: jest.fn(),
  sendPasswordResetEmail: jest.fn(),
  sendMfaBackupCodesRegeneratedEmail: mockSendMfaBackupCodesRegeneratedEmail,
}));

jest.mock('@api/modules/auth/models/user.model', () => ({
  UserModel: { findOne: jest.fn(), findById: jest.fn(), create: jest.fn() },
}));
jest.mock('@api/modules/auth/models/refresh-token.model', () => ({
  RefreshTokenModel: { findOne: jest.fn(), create: jest.fn(), deleteOne: jest.fn(), deleteMany: jest.fn() },
}));
jest.mock('@api/modules/auth/totp.service', () => ({
  totpService: { setup: jest.fn(), verify: jest.fn() },
}));
jest.mock('@api/modules/audit/audit.service', () => ({
  auditLog: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('@api/middlewares/rate-limit.middleware', () => {
  const pass = (_req: unknown, _res: unknown, next: () => void) => next();
  return { authLimiter: pass, forgotPasswordLimiter: pass, aiLimiter: pass, paymentLimiter: pass, generalLimiter: pass };
});
jest.mock('@api/instrument.ts');

// ── Imports ───────────────────────────────────────────────────────────────────

import request from 'supertest';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import app from '@api/app';
import { UserModel } from '@api/modules/auth/models/user.model';
import { totpService } from '@api/modules/auth/totp.service';
import { signAccessToken } from './token.service';

// ── Helpers ───────────────────────────────────────────────────────────────────

const CLINIC_ID = '507f1f77bcf86cd799439011';
const USER_ID = '507f1f77bcf86cd799439022';
const VALID_PASSWORD = 'SecurePass1!';

function hashCode(code: string): string {
  return crypto.createHash('sha256').update(code).digest('hex');
}

function makeToken(overrides: Record<string, unknown> = {}): string {
  return signAccessToken({
    userId: USER_ID,
    role: 'DOCTOR',
    clinicId: CLINIC_ID,
    ...overrides,
  });
}

async function makeMockUser(overrides: Record<string, unknown> = {}) {
  const hashedPassword = await bcrypt.hash(VALID_PASSWORD, 1);
  return {
    id: USER_ID,
    _id: USER_ID,
    email: 'doctor@clinic.com',
    fullName: 'Dr. Test',
    password: hashedPassword,
    role: 'DOCTOR',
    clinicId: CLINIC_ID,
    isActive: true,
    mfaEnabled: true,
    // Encrypt a dummy TOTP secret the same way auth.controller does
    mfaSecret: (() => {
      const { encrypt } = require('@api/lib/encrypt');
      return encrypt('JBSWY3DPEHPK3PXP');
    })(),
    mfaBackupCodes: Array.from({ length: 10 }, () =>
      hashCode(crypto.randomBytes(4).toString('hex'))
    ),
    save: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

// ── GET /api/v1/auth/mfa/backup-codes/count ──────────────────────────────────

describe('GET /api/v1/auth/mfa/backup-codes/count', () => {
  const url = '/api/v1/auth/mfa/backup-codes/count';

  beforeEach(() => jest.clearAllMocks());

  it('returns 401 when unauthenticated', async () => {
    const res = await request(app).get(url);
    expect(res.status).toBe(401);
  });

  it('returns 409 when MFA is not enabled', async () => {
    const user = await makeMockUser({ mfaEnabled: false });
    (UserModel.findById as jest.Mock).mockReturnValue({
      select: jest.fn().mockResolvedValue(user),
    });

    const res = await request(app)
      .get(url)
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(409);
  });

  it('returns remaining count with low:false when >= 3 codes remain', async () => {
    const user = await makeMockUser();
    (UserModel.findById as jest.Mock).mockReturnValue({
      select: jest.fn().mockResolvedValue(user),
    });

    const res = await request(app)
      .get(url)
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.data.remaining).toBe(10);
    expect(res.body.data.total).toBe(10);
    expect(res.body.data.low).toBe(false);
  });

  it('returns low:true when fewer than 3 codes remain', async () => {
    const user = await makeMockUser({ mfaBackupCodes: [hashCode('aa'), hashCode('bb')] });
    (UserModel.findById as jest.Mock).mockReturnValue({
      select: jest.fn().mockResolvedValue(user),
    });

    const res = await request(app)
      .get(url)
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.data.remaining).toBe(2);
    expect(res.body.data.low).toBe(true);
  });

  it('returns remaining:0 when all backup codes have been used', async () => {
    const user = await makeMockUser({ mfaBackupCodes: [] });
    (UserModel.findById as jest.Mock).mockReturnValue({
      select: jest.fn().mockResolvedValue(user),
    });

    const res = await request(app)
      .get(url)
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.data.remaining).toBe(0);
    expect(res.body.data.low).toBe(true);
  });
});

// ── POST /api/v1/auth/mfa/backup-codes/regenerate ────────────────────────────

describe('POST /api/v1/auth/mfa/backup-codes/regenerate', () => {
  const url = '/api/v1/auth/mfa/backup-codes/regenerate';

  beforeEach(() => jest.clearAllMocks());

  it('returns 401 when unauthenticated', async () => {
    const res = await request(app).post(url).send({ password: VALID_PASSWORD, totp: '123456' });
    expect(res.status).toBe(401);
  });

  it('returns 400 when neither totp nor backupCode is provided', async () => {
    const user = await makeMockUser();
    (UserModel.findById as jest.Mock).mockReturnValue({
      select: jest.fn().mockResolvedValue(user),
    });

    const res = await request(app)
      .post(url)
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ password: VALID_PASSWORD });

    expect(res.status).toBe(400);
  });

  it('returns 409 when MFA is not enabled', async () => {
    const user = await makeMockUser({ mfaEnabled: false, mfaSecret: undefined });
    (UserModel.findById as jest.Mock).mockReturnValue({
      select: jest.fn().mockResolvedValue(user),
    });

    const res = await request(app)
      .post(url)
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ password: VALID_PASSWORD, totp: '123456' });

    expect(res.status).toBe(409);
  });

  it('returns 400 when password is incorrect', async () => {
    const user = await makeMockUser();
    (UserModel.findById as jest.Mock).mockReturnValue({
      select: jest.fn().mockResolvedValue(user),
    });

    const res = await request(app)
      .post(url)
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ password: 'WrongPassword1!', totp: '123456' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('InvalidCredentials');
  });

  it('returns 400 when TOTP code is invalid', async () => {
    const user = await makeMockUser();
    (UserModel.findById as jest.Mock).mockReturnValue({
      select: jest.fn().mockResolvedValue(user),
    });
    (totpService.verify as jest.Mock).mockReturnValue(false);

    const res = await request(app)
      .post(url)
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ password: VALID_PASSWORD, totp: '000000' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('InvalidCode');
  });

  it('regenerates codes and returns 10 new plaintext codes when TOTP is valid', async () => {
    const user = await makeMockUser();
    (UserModel.findById as jest.Mock).mockReturnValue({
      select: jest.fn().mockResolvedValue(user),
    });
    (totpService.verify as jest.Mock).mockReturnValue(true);

    const res = await request(app)
      .post(url)
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ password: VALID_PASSWORD, totp: '123456' });

    expect(res.status).toBe(200);
    expect(res.body.data.backupCodes).toHaveLength(10);
    expect(user.save).toHaveBeenCalledTimes(1);
    // Stored codes must be different from the plain codes (they're hashed)
    const returned = res.body.data.backupCodes as string[];
    expect(returned).not.toContain(user.mfaBackupCodes[0]);
  });

  it('invalidates old backup codes on regeneration', async () => {
    const oldCodes = ['AA', 'BB', 'CC'].map(hashCode);
    const user = await makeMockUser({ mfaBackupCodes: oldCodes });
    (UserModel.findById as jest.Mock).mockReturnValue({
      select: jest.fn().mockResolvedValue(user),
    });
    (totpService.verify as jest.Mock).mockReturnValue(true);

    await request(app)
      .post(url)
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ password: VALID_PASSWORD, totp: '123456' });

    // mfaBackupCodes should now be 10 new hashed codes, not the old 3
    expect(user.mfaBackupCodes).toHaveLength(10);
    expect(user.mfaBackupCodes).not.toEqual(oldCodes);
  });

  it('accepts an existing backup code instead of TOTP', async () => {
    const plainCode = 'AABBCCDD';
    const user = await makeMockUser({ mfaBackupCodes: [hashCode(plainCode)] });
    (UserModel.findById as jest.Mock).mockReturnValue({
      select: jest.fn().mockResolvedValue(user),
    });

    const res = await request(app)
      .post(url)
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ password: VALID_PASSWORD, backupCode: plainCode });

    expect(res.status).toBe(200);
    expect(res.body.data.backupCodes).toHaveLength(10);
  });

  it('returns 400 when backup code is invalid', async () => {
    const user = await makeMockUser({ mfaBackupCodes: [hashCode('VALIDCODE')] });
    (UserModel.findById as jest.Mock).mockReturnValue({
      select: jest.fn().mockResolvedValue(user),
    });

    const res = await request(app)
      .post(url)
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ password: VALID_PASSWORD, backupCode: 'WRONGCODE' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('InvalidCode');
  });

  it('sends email notification after successful regeneration', async () => {
    const user = await makeMockUser();
    (UserModel.findById as jest.Mock).mockReturnValue({
      select: jest.fn().mockResolvedValue(user),
    });
    (totpService.verify as jest.Mock).mockReturnValue(true);

    await request(app)
      .post(url)
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ password: VALID_PASSWORD, totp: '123456' });

    expect(mockSendMfaBackupCodesRegeneratedEmail).toHaveBeenCalledWith(
      user.email,
      user.fullName,
      expect.any(Array)
    );
  });

  it('returned backup codes are unique', async () => {
    const user = await makeMockUser();
    (UserModel.findById as jest.Mock).mockReturnValue({
      select: jest.fn().mockResolvedValue(user),
    });
    (totpService.verify as jest.Mock).mockReturnValue(true);

    const res = await request(app)
      .post(url)
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ password: VALID_PASSWORD, totp: '123456' });

    const codes: string[] = res.body.data.backupCodes;
    expect(new Set(codes).size).toBe(codes.length);
  });
});
