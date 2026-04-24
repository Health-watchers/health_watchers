/**
 * Integration tests for POST /api/v1/auth/login and POST /api/v1/auth/refresh.
 *
 * Uses supertest against the real Express app with all external dependencies
 * (MongoDB, email, config) mocked — no live database required.
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

// Mock all routes that are not under test to keep the app lightweight
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

import request from 'supertest';
import bcrypt from 'bcryptjs';
import app from '@api/app';
import { UserModel } from '@api/modules/auth/models/user.model';
import { RefreshTokenModel } from '@api/modules/auth/models/refresh-token.model';
import { signRefreshToken, REFRESH_TOKEN_EXPIRY_MS } from './token.service';

// ── Helpers ───────────────────────────────────────────────────────────────────

const CLINIC_ID = '507f1f77bcf86cd799439011';
const USER_ID = '507f1f77bcf86cd799439022';

/** A minimal active user document */
function makeUser(overrides: Record<string, unknown> = {}) {
  return {
    id: USER_ID,
    _id: USER_ID,
    email: 'doctor@clinic.com',
    password: '$2a$12$hashedpassword',
    role: 'DOCTOR',
    clinicId: CLINIC_ID,
    isActive: true,
    mfaEnabled: false,
    failedLoginAttempts: 0,
    lockedUntil: undefined as Date | undefined,
    save: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

// ── POST /api/v1/auth/login ───────────────────────────────────────────────────

describe('POST /api/v1/auth/login', () => {
  beforeEach(() => jest.clearAllMocks());

  // ── 200: valid credentials ────────────────────────────────────────────────

  it('returns 200 with accessToken and refreshToken for valid credentials', async () => {
    const user = makeUser();
    (UserModel.findOne as jest.Mock).mockResolvedValue(user);
    jest.spyOn(bcrypt, 'compare').mockResolvedValue(true as never);
    (RefreshTokenModel.create as jest.Mock).mockResolvedValue({});

    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'doctor@clinic.com', password: 'ValidPass1!' });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('success');
    expect(res.body.data).toHaveProperty('accessToken');
    expect(res.body.data).toHaveProperty('refreshToken');
    expect(typeof res.body.data.accessToken).toBe('string');
    expect(typeof res.body.data.refreshToken).toBe('string');
  });

  it('does not include password or sensitive fields in the response', async () => {
    const user = makeUser();
    (UserModel.findOne as jest.Mock).mockResolvedValue(user);
    jest.spyOn(bcrypt, 'compare').mockResolvedValue(true as never);
    (RefreshTokenModel.create as jest.Mock).mockResolvedValue({});

    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'doctor@clinic.com', password: 'ValidPass1!' });

    const body = JSON.stringify(res.body);
    expect(body).not.toContain('"password"');
    expect(body).not.toContain('hashedpassword');
  });

  it('stores a new refresh token record in the database', async () => {
    const user = makeUser();
    (UserModel.findOne as jest.Mock).mockResolvedValue(user);
    jest.spyOn(bcrypt, 'compare').mockResolvedValue(true as never);
    (RefreshTokenModel.create as jest.Mock).mockResolvedValue({});

    await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'doctor@clinic.com', password: 'ValidPass1!' });

    expect(RefreshTokenModel.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: USER_ID,
        consumed: false,
        expiresAt: expect.any(Date),
      }),
    );
  });

  // ── 401: wrong password ───────────────────────────────────────────────────

  it('returns 401 for wrong password', async () => {
    const user = makeUser();
    (UserModel.findOne as jest.Mock).mockResolvedValue(user);
    jest.spyOn(bcrypt, 'compare').mockResolvedValue(false as never);

    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'doctor@clinic.com', password: 'WrongPass1!' });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Unauthorized');
    expect(res.body.message).toBe('Invalid email or password');
  });

  it('increments failedLoginAttempts on wrong password', async () => {
    const user = makeUser({ failedLoginAttempts: 0 });
    (UserModel.findOne as jest.Mock).mockResolvedValue(user);
    jest.spyOn(bcrypt, 'compare').mockResolvedValue(false as never);

    await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'doctor@clinic.com', password: 'WrongPass1!' });

    expect(user.failedLoginAttempts).toBe(1);
    expect(user.save).toHaveBeenCalled();
  });

  it('locks account after 5 failed attempts', async () => {
    const user = makeUser({ failedLoginAttempts: 4 });
    (UserModel.findOne as jest.Mock).mockResolvedValue(user);
    jest.spyOn(bcrypt, 'compare').mockResolvedValue(false as never);

    await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'doctor@clinic.com', password: 'WrongPass1!' });

    expect(user.lockedUntil).toBeInstanceOf(Date);
    expect(user.lockedUntil!.getTime()).toBeGreaterThan(Date.now());
  });

  // ── 401: non-existent email ───────────────────────────────────────────────

  it('returns 401 for non-existent email', async () => {
    (UserModel.findOne as jest.Mock).mockResolvedValue(null);

    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'nobody@nowhere.com', password: 'ValidPass1!' });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Unauthorized');
  });

  // ── 401: inactive user ────────────────────────────────────────────────────

  it('returns 401 for inactive user', async () => {
    (UserModel.findOne as jest.Mock).mockResolvedValue(makeUser({ isActive: false }));

    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'doctor@clinic.com', password: 'ValidPass1!' });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Unauthorized');
  });

  // ── 423: locked account ───────────────────────────────────────────────────

  it('returns 423 for a locked account', async () => {
    const lockedUntil = new Date(Date.now() + 10 * 60 * 1000); // 10 min from now
    (UserModel.findOne as jest.Mock).mockResolvedValue(makeUser({ lockedUntil }));

    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'doctor@clinic.com', password: 'ValidPass1!' });

    expect(res.status).toBe(423);
    expect(res.body.error).toBe('AccountLocked');
    expect(res.body).toHaveProperty('retryAfter');
    expect(res.headers).toHaveProperty('retry-after');
  });

  // ── 400: validation errors ────────────────────────────────────────────────

  it('returns 400 when email is missing', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ password: 'ValidPass1!' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('ValidationError');
  });

  it('returns 400 when email format is invalid', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'not-an-email', password: 'ValidPass1!' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('ValidationError');
  });

  it('returns 400 when password is missing', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'doctor@clinic.com' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('ValidationError');
  });

  it('returns 400 when body is empty', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('ValidationError');
  });

  // ── MFA flow ──────────────────────────────────────────────────────────────

  it('returns mfa_required status and tempToken when MFA is enabled', async () => {
    const user = makeUser({ mfaEnabled: true });
    (UserModel.findOne as jest.Mock).mockResolvedValue(user);
    jest.spyOn(bcrypt, 'compare').mockResolvedValue(true as never);

    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'doctor@clinic.com', password: 'ValidPass1!' });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('mfa_required');
    expect(res.body.data).toHaveProperty('mfaRequired', true);
    expect(res.body.data).toHaveProperty('tempToken');
    expect(typeof res.body.data.tempToken).toBe('string');
  });

  // ── Timing-safe: same error for wrong email vs wrong password ─────────────

  it('returns the same error message for wrong email and wrong password (no enumeration)', async () => {
    (UserModel.findOne as jest.Mock).mockResolvedValue(null);
    const resNoUser = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'nobody@nowhere.com', password: 'ValidPass1!' });

    const user = makeUser();
    (UserModel.findOne as jest.Mock).mockResolvedValue(user);
    jest.spyOn(bcrypt, 'compare').mockResolvedValue(false as never);
    const resWrongPw = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'doctor@clinic.com', password: 'WrongPass1!' });

    expect(resNoUser.body.message).toBe(resWrongPw.body.message);
  });
});

// ── POST /api/v1/auth/refresh ─────────────────────────────────────────────────

describe('POST /api/v1/auth/refresh', () => {
  beforeEach(() => jest.clearAllMocks());

  const userPayload = { userId: USER_ID, role: 'DOCTOR', clinicId: CLINIC_ID };

  // ── 200: valid refresh token ──────────────────────────────────────────────

  it('returns 200 with new accessToken and refreshToken for a valid refresh token', async () => {
    const { token, jti, family } = signRefreshToken(userPayload);
    const saveMock = jest.fn().mockResolvedValue(undefined);
    (RefreshTokenModel.findOne as jest.Mock).mockResolvedValue({ jti, family, consumed: false, save: saveMock });
    (UserModel.findById as jest.Mock).mockResolvedValue(makeUser());
    (RefreshTokenModel.create as jest.Mock).mockResolvedValue({});

    const res = await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: token });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('success');
    expect(res.body.data).toHaveProperty('accessToken');
    expect(res.body.data).toHaveProperty('refreshToken');
  });

  it('marks the old token as consumed after rotation', async () => {
    const { token, jti, family } = signRefreshToken(userPayload);
    const saveMock = jest.fn().mockResolvedValue(undefined);
    const existing = { jti, family, consumed: false, save: saveMock };
    (RefreshTokenModel.findOne as jest.Mock).mockResolvedValue(existing);
    (UserModel.findById as jest.Mock).mockResolvedValue(makeUser());
    (RefreshTokenModel.create as jest.Mock).mockResolvedValue({});

    await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: token });

    expect(existing.consumed).toBe(true);
    expect(saveMock).toHaveBeenCalled();
  });

  it('issues a new refresh token with the same family', async () => {
    const { token, jti, family } = signRefreshToken(userPayload);
    const saveMock = jest.fn().mockResolvedValue(undefined);
    (RefreshTokenModel.findOne as jest.Mock).mockResolvedValue({ jti, family, consumed: false, save: saveMock });
    (UserModel.findById as jest.Mock).mockResolvedValue(makeUser());
    (RefreshTokenModel.create as jest.Mock).mockResolvedValue({});

    await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: token });

    expect(RefreshTokenModel.create).toHaveBeenCalledWith(
      expect.objectContaining({ family, consumed: false }),
    );
  });

  // ── 401: invalid token ────────────────────────────────────────────────────

  it('returns 401 for an invalid refresh token string', async () => {
    const res = await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: 'this.is.not.valid' });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Unauthorized');
    expect(RefreshTokenModel.findOne).not.toHaveBeenCalled();
  });

  it('returns 401 when JTI is not found in the database', async () => {
    const { token } = signRefreshToken(userPayload);
    (RefreshTokenModel.findOne as jest.Mock).mockResolvedValue(null);

    const res = await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: token });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Unauthorized');
  });

  it('returns 401 for an expired refresh token', async () => {
    // Sign a token that expired 1 second ago using the real secret
    const jwt = require('jsonwebtoken');
    const expiredToken = jwt.sign(
      { userId: USER_ID, role: 'DOCTOR', clinicId: CLINIC_ID, jti: 'test-jti', family: 'test-family' },
      'test-refresh-secret-32-chars-long!',
      {
        expiresIn: '-1s',
        issuer: 'health-watchers-api',
        audience: 'health-watchers-client',
      },
    );

    const res = await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: expiredToken });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Unauthorized');
    expect(RefreshTokenModel.findOne).not.toHaveBeenCalled();
  });

  it('returns 401 when an access token is used as a refresh token', async () => {
    // Access tokens are signed with a different secret — verifyRefreshToken should reject them
    const jwt = require('jsonwebtoken');
    const accessToken = jwt.sign(
      { userId: USER_ID, role: 'DOCTOR', clinicId: CLINIC_ID },
      'test-access-secret-32-chars-long!!',
      {
        expiresIn: '15m',
        issuer: 'health-watchers-api',
        audience: 'health-watchers-client',
      },
    );

    const res = await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: accessToken });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Unauthorized');
  });

  // ── 401: replay attack ────────────────────────────────────────────────────

  it('returns 401 and revokes entire family when a consumed token is replayed', async () => {
    const { token, jti, family } = signRefreshToken(userPayload);
    (RefreshTokenModel.findOne as jest.Mock).mockResolvedValue({ jti, family, consumed: true });

    const res = await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: token });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Unauthorized');
    expect(RefreshTokenModel.deleteMany).toHaveBeenCalledWith({ family });
  });

  // ── 400: validation ───────────────────────────────────────────────────────

  it('returns 400 when refreshToken field is missing', async () => {
    const res = await request(app)
      .post('/api/v1/auth/refresh')
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('ValidationError');
  });
});
