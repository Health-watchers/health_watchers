/**
 * Tests for users.controller.ts — GET /users/me, PATCH /users/me/profile,
 * MFA endpoints, and related self-service operations.
 *
 * Issue: #1484
 * Target: ≥ 85% coverage, every RBAC rule has a negative test.
 */

process.env.MONGO_URI = 'mongodb://localhost:27017/test';
process.env.JWT_ACCESS_TOKEN_SECRET = 'abcdefghijklmnopqrstuvwxyz012345';
process.env.JWT_REFRESH_TOKEN_SECRET = 'abcdefghijklmnopqrstuvwxyz012345';
process.env.API_PORT = '3001';

// ── Module mocks ───────────────────────────────────────────────────────────────

jest.mock('@health-watchers/config', () => ({
  config: {
    jwt: {
      accessTokenSecret: 'abcdefghijklmnopqrstuvwxyz012345',
      refreshTokenSecret: 'abcdefghijklmnopqrstuvwxyz012345',
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
jest.mock('@api/modules/payments/payments.controller', () => ({
  paymentRoutes: require('express').Router(),
}));
jest.mock('@api/modules/ai/ai.routes', () => require('express').Router());
jest.mock('@api/modules/dashboard/dashboard.routes', () => require('express').Router());
jest.mock('@api/modules/appointments/appointments.controller', () => ({
  appointmentRoutes: require('express').Router(),
}));
jest.mock('@api/config/db', () => ({
  connectDB: jest.fn().mockReturnValue(new Promise(() => {})),
}));
jest.mock('@api/docs/swagger', () => ({ setupSwagger: jest.fn() }));
jest.mock('@api/modules/payments/services/payment-expiration-job', () => ({
  startPaymentExpirationJob: jest.fn(),
  stopPaymentExpirationJob: jest.fn(),
}));

jest.mock('@api/modules/auth/models/user.model', () => ({
  UserModel: { findById: jest.fn() },
}));
jest.mock('@api/modules/clinics/clinic.model', () => ({
  ClinicModel: { findById: jest.fn() },
}));
jest.mock('@api/modules/auth/totp.service', () => ({
  totpService: {
    setup: jest.fn().mockResolvedValue({
      secret: 'TOTP_SECRET',
      otpauthUrl: 'otpauth://totp/test',
      qrCodeDataUrl: 'data:image/png;base64,abc',
    }),
    verify: jest.fn().mockReturnValue(true),
  },
}));
jest.mock('@api/services/token-denylist.service', () => ({
  isDenylisted: jest.fn().mockResolvedValue(false),
  isInvalidatedForUser: jest.fn().mockResolvedValue(false),
  addToDenylist: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('@api/utils/mailer', () => ({
  sendMail: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('@api/utils/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

// ── Imports ────────────────────────────────────────────────────────────────────

import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '@api/app';
import { UserModel } from '../auth/models/user.model';
import { ClinicModel } from '../clinics/clinic.model';

// ── Helpers ────────────────────────────────────────────────────────────────────

const JWT_SECRET = 'abcdefghijklmnopqrstuvwxyz012345';
const CLINIC_ID = 'clinic-abc';
const USER_ID = '507f1f77bcf86cd799439011';

function makeToken(role = 'DOCTOR', userId = USER_ID, clinicId = CLINIC_ID) {
  return jwt.sign(
    { userId, role, clinicId, jti: `jti-${Math.random()}` },
    JWT_SECRET,
    {
      expiresIn: '15m',
      issuer: 'health-watchers-api',
      audience: 'health-watchers-client',
    }
  );
}

function makeUserDoc(overrides: Record<string, unknown> = {}) {
  return {
    _id: USER_ID,
    fullName: 'Dr. Test',
    email: 'test@clinic.com',
    role: 'DOCTOR',
    clinicId: CLINIC_ID,
    mfaEnabled: false,
    preferences: {
      language: 'en',
      theme: 'system',
      emailNotifications: true,
      inAppNotifications: true,
      notificationTypes: {},
    },
    save: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

// ── Lifecycle ──────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  (ClinicModel.findById as jest.Mock).mockReturnValue({
    lean: jest.fn().mockResolvedValue({ name: 'Test Clinic' }),
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/v1/users/me
// ─────────────────────────────────────────────────────────────────────────────

describe('GET /api/v1/users/me', () => {
  it('returns 200 with user profile for authenticated user', async () => {
    (UserModel.findById as jest.Mock).mockResolvedValue(makeUserDoc());

    const res = await request(app)
      .get('/api/v1/users/me')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('success');
    expect(res.body.data.email).toBe('test@clinic.com');
  });

  it('returns 401 without a token', async () => {
    const res = await request(app).get('/api/v1/users/me');
    expect(res.status).toBe(401);
  });

  it('returns 401 if user is not found in DB', async () => {
    (UserModel.findById as jest.Mock).mockResolvedValue(null);

    const res = await request(app)
      .get('/api/v1/users/me')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(401);
  });

  it('includes mfaEnabled in the response', async () => {
    (UserModel.findById as jest.Mock).mockResolvedValue(makeUserDoc({ mfaEnabled: true }));

    const res = await request(app)
      .get('/api/v1/users/me')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.body.data.mfaEnabled).toBe(true);
  });

  it('returns preference defaults when preferences are undefined', async () => {
    (UserModel.findById as jest.Mock).mockResolvedValue(
      makeUserDoc({ preferences: undefined })
    );

    const res = await request(app)
      .get('/api/v1/users/me')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.body.data.preferences.language).toBe('en');
    expect(res.body.data.preferences.emailNotifications).toBe(true);
  });

  it('includes clinicName from the clinic lookup', async () => {
    (UserModel.findById as jest.Mock).mockResolvedValue(makeUserDoc());

    const res = await request(app)
      .get('/api/v1/users/me')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.body.data.clinicName).toBe('Test Clinic');
  });

  it('does not expose password in the response', async () => {
    (UserModel.findById as jest.Mock).mockResolvedValue(
      makeUserDoc({ password: 'super-secret-hash' })
    );

    const res = await request(app)
      .get('/api/v1/users/me')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(JSON.stringify(res.body.data)).not.toContain('super-secret-hash');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/v1/users/me/profile
// ─────────────────────────────────────────────────────────────────────────────

describe('PATCH /api/v1/users/me/profile', () => {
  it('returns 200 and saves updated fullName', async () => {
    const user = makeUserDoc();
    (UserModel.findById as jest.Mock).mockResolvedValue(user);

    const res = await request(app)
      .patch('/api/v1/users/me/profile')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ fullName: 'Updated Name' });

    expect(res.status).toBe(200);
    expect(user.save).toHaveBeenCalled();
  });

  it('returns 400 if fullName is missing', async () => {
    const res = await request(app)
      .patch('/api/v1/users/me/profile')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({});

    expect(res.status).toBe(400);
  });

  it('returns 400 if fullName is an empty string', async () => {
    const res = await request(app)
      .patch('/api/v1/users/me/profile')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ fullName: '' });

    expect(res.status).toBe(400);
  });

  it('returns 400 if fullName exceeds 100 characters', async () => {
    const res = await request(app)
      .patch('/api/v1/users/me/profile')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ fullName: 'A'.repeat(101) });

    expect(res.status).toBe(400);
  });

  it('returns 401 if user is not found', async () => {
    (UserModel.findById as jest.Mock).mockResolvedValue(null);

    const res = await request(app)
      .patch('/api/v1/users/me/profile')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ fullName: 'New Name' });

    expect(res.status).toBe(401);
  });

  it('returns 401 without a token', async () => {
    const res = await request(app)
      .patch('/api/v1/users/me/profile')
      .send({ fullName: 'New Name' });

    expect(res.status).toBe(401);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/v1/users/me/mfa/enable
// ─────────────────────────────────────────────────────────────────────────────

describe('POST /api/v1/users/me/mfa/enable', () => {
  it('returns 200 with qrCodeUrl and secret', async () => {
    (UserModel.findById as jest.Mock).mockResolvedValue(makeUserDoc());

    const res = await request(app)
      .post('/api/v1/users/me/mfa/enable')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.data.qrCodeUrl).toBeDefined();
    expect(res.body.data.secret).toBe('TOTP_SECRET');
  });

  it('returns 401 when user not found', async () => {
    (UserModel.findById as jest.Mock).mockResolvedValue(null);

    const res = await request(app)
      .post('/api/v1/users/me/mfa/enable')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(401);
  });

  it('returns 401 without a token', async () => {
    const res = await request(app).post('/api/v1/users/me/mfa/enable');
    expect(res.status).toBe(401);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/v1/users/me/mfa/verify
// ─────────────────────────────────────────────────────────────────────────────

describe('POST /api/v1/users/me/mfa/verify', () => {
  const { totpService } = jest.requireMock('@api/modules/auth/totp.service');

  it('returns 200 and enables MFA when code is valid', async () => {
    const user = makeUserDoc({ mfaEnabled: false, mfaSecret: 'SECRET' });
    (UserModel.findById as jest.Mock).mockReturnValue({
      select: jest.fn().mockResolvedValue(user),
    });
    totpService.verify.mockReturnValue(true);

    const res = await request(app)
      .post('/api/v1/users/me/mfa/verify')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ code: '123456' });

    expect(res.status).toBe(200);
    expect(user.mfaEnabled).toBe(true);
    expect(user.save).toHaveBeenCalled();
  });

  it('returns 400 when TOTP code is invalid', async () => {
    const user = makeUserDoc({ mfaSecret: 'SECRET' });
    (UserModel.findById as jest.Mock).mockReturnValue({
      select: jest.fn().mockResolvedValue(user),
    });
    totpService.verify.mockReturnValue(false);

    const res = await request(app)
      .post('/api/v1/users/me/mfa/verify')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ code: '000000' });

    expect(res.status).toBe(400);
    expect(res.body.message).toContain('Invalid verification code');
  });

  it('returns 400 when code is not 6 digits', async () => {
    const res = await request(app)
      .post('/api/v1/users/me/mfa/verify')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ code: 'abcdef' });

    expect(res.status).toBe(400);
  });

  it('returns 401 when user not found', async () => {
    (UserModel.findById as jest.Mock).mockReturnValue({
      select: jest.fn().mockResolvedValue(null),
    });

    const res = await request(app)
      .post('/api/v1/users/me/mfa/verify')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ code: '123456' });

    expect(res.status).toBe(401);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/v1/users/me/mfa/disable
// ─────────────────────────────────────────────────────────────────────────────

describe('POST /api/v1/users/me/mfa/disable', () => {
  it('returns 200 and clears mfaEnabled and mfaSecret', async () => {
    const user = makeUserDoc({ mfaEnabled: true, mfaSecret: 'SOME_SECRET' });
    (UserModel.findById as jest.Mock).mockResolvedValue(user);

    const res = await request(app)
      .post('/api/v1/users/me/mfa/disable')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(200);
    expect(user.mfaEnabled).toBe(false);
    expect(user.mfaSecret).toBeUndefined();
    expect(user.save).toHaveBeenCalled();
  });

  it('returns 401 when user not found', async () => {
    (UserModel.findById as jest.Mock).mockResolvedValue(null);

    const res = await request(app)
      .post('/api/v1/users/me/mfa/disable')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(401);
  });

  it('returns 401 without a token', async () => {
    const res = await request(app).post('/api/v1/users/me/mfa/disable');
    expect(res.status).toBe(401);
  });
});
