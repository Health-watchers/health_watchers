/**
 * Integration tests for POST /api/v1/users/me/password (change password).
 */

// ── Mocks (must be before imports) ───────────────────────────────────────────

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

jest.mock('@api/modules/auth/models/user.model', () => ({
  UserModel: { findById: jest.fn() },
}));
jest.mock('bcryptjs', () => ({
  compare: jest.fn(),
  hash: jest.fn(),
  hashSync: jest.fn(),
}));

// Mock modules that have runtime issues (not needed for auth tests)
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
jest.mock('@api/modules/clinics/clinic.model', () => ({ ClinicModel: {} }));
jest.mock('@api/modules/auth/auth.controller', () => ({ authRoutes: require('express').Router() }));
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
jest.mock('@api/modules/auth/totp.service', () => ({
  totpService: { setup: jest.fn(), verify: jest.fn() },
}));

// Mock the rate-limit middleware so the limiter doesn't block test requests
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
import jwt from 'jsonwebtoken';
import app from '@api/app';
import { UserModel } from '@api/modules/auth/models/user.model';

// ── Helpers ───────────────────────────────────────────────────────────────────

const TEST_USER_ID = '507f1f77bcf86cd799439011';

function makeToken(): string {
  return jwt.sign(
    { userId: TEST_USER_ID, role: 'DOCTOR', clinicId: 'clinic123' },
    'test-access-secret',
    { expiresIn: '15m', issuer: 'health-watchers-api', audience: 'health-watchers-client' }
  );
}

function makeMockUser(overrides: Record<string, unknown> = {}) {
  return {
    _id: TEST_USER_ID,
    id: TEST_USER_ID,
    password: '$2a$12$hashedpassword',
    save: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function mockFindById(user: ReturnType<typeof makeMockUser> | null) {
  (UserModel.findById as jest.Mock).mockReturnValue({
    select: jest.fn().mockResolvedValue(user),
  });
}

const VALID_BODY = {
  currentPassword: 'OldPass1!',
  newPassword: 'NewPass1!',
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('POST /api/v1/users/me/password', () => {
  const token = makeToken();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ── Authentication required ───────────────────────────────────────────────

  describe('Authentication required', () => {
    it('returns 401 when no Authorization header is provided', async () => {
      const res = await request(app)
        .post('/api/v1/users/me/password')
        .send(VALID_BODY);

      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Unauthorized');
    });

    it('returns 401 when Authorization header is malformed (not Bearer)', async () => {
      const res = await request(app)
        .post('/api/v1/users/me/password')
        .set('Authorization', 'Basic sometoken')
        .send(VALID_BODY);

      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Unauthorized');
    });

    it('returns 401 when Bearer token is invalid/expired', async () => {
      const res = await request(app)
        .post('/api/v1/users/me/password')
        .set('Authorization', 'Bearer this.is.not.a.valid.token')
        .send(VALID_BODY);

      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Unauthorized');
    });
  });

  // ── Validation errors ─────────────────────────────────────────────────────

  describe('Validation errors', () => {
    it('returns 400 when currentPassword is missing', async () => {
      const res = await request(app)
        .post('/api/v1/users/me/password')
        .set('Authorization', `Bearer ${token}`)
        .send({ newPassword: 'NewPass1!' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('ValidationError');
    });

    it('returns 400 when newPassword is missing', async () => {
      const res = await request(app)
        .post('/api/v1/users/me/password')
        .set('Authorization', `Bearer ${token}`)
        .send({ currentPassword: 'OldPass1!' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('ValidationError');
    });

    it('returns 400 when body is empty', async () => {
      const res = await request(app)
        .post('/api/v1/users/me/password')
        .set('Authorization', `Bearer ${token}`)
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('ValidationError');
    });

    it('returns 400 when newPassword is fewer than 8 characters', async () => {
      const res = await request(app)
        .post('/api/v1/users/me/password')
        .set('Authorization', `Bearer ${token}`)
        .send({ currentPassword: 'OldPass1!', newPassword: 'Ab1!' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('ValidationError');
    });
  });

  // ── Wrong current password ────────────────────────────────────────────────

  describe('Wrong currentPassword', () => {
    it('returns 400 when currentPassword is wrong', async () => {
      const mockUser = makeMockUser();
      mockFindById(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      const res = await request(app)
        .post('/api/v1/users/me/password')
        .set('Authorization', `Bearer ${token}`)
        .send(VALID_BODY);

      expect(res.status).toBe(400);
      expect(res.body).toEqual({
        error: 'BadRequest',
        message: 'Current password is incorrect',
      });
    });
  });

  // ── Valid request ─────────────────────────────────────────────────────────

  describe('Valid request', () => {
    it('returns 200 with success body on valid request', async () => {
      const mockUser = makeMockUser();
      mockFindById(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      const res = await request(app)
        .post('/api/v1/users/me/password')
        .set('Authorization', `Bearer ${token}`)
        .send(VALID_BODY);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(res.body.message).toBe('Password updated successfully');
    });

    it('does not include password or sensitive fields in the response', async () => {
      const mockUser = makeMockUser();
      mockFindById(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      const res = await request(app)
        .post('/api/v1/users/me/password')
        .set('Authorization', `Bearer ${token}`)
        .send(VALID_BODY);

      expect(res.status).toBe(200);
      const body = JSON.stringify(res.body);
      expect(body).not.toContain('"password"');
      expect(body).not.toContain('hashedpassword');
    });

    it('saves the user document after password change', async () => {
      const mockUser = makeMockUser();
      mockFindById(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      await request(app)
        .post('/api/v1/users/me/password')
        .set('Authorization', `Bearer ${token}`)
        .send(VALID_BODY);

      expect(mockUser.save).toHaveBeenCalled();
    });
  });
});
