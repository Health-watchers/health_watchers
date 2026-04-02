/**
 * Unit tests for PATCH /api/v1/auth/me/password
 * Task 3.1 — change-password spec
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
jest.mock('@api/modules/patients/patients.controller', () => ({ patientRoutes: require('express').Router() }));
jest.mock('@api/modules/encounters/encounters.controller', () => ({ encounterRoutes: require('express').Router() }));
jest.mock('@api/modules/payments/payments.controller', () => ({ paymentRoutes: require('express').Router() }));
jest.mock('@api/modules/ai/ai.routes', () => require('express').Router());
jest.mock('@api/modules/dashboard/dashboard.routes', () => require('express').Router());
jest.mock('@api/modules/appointments/appointments.controller', () => ({ appointmentRoutes: require('express').Router() }));
jest.mock('@api/modules/clinics/clinic.model', () => ({ ClinicModel: {} }));
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

// Prevent app.listen() from binding to a real port during tests.
// connectDB is mocked to never resolve, so start() never reaches app.listen().
// ── Imports ───────────────────────────────────────────────────────────────────

import request from 'supertest';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import app from '@api/app';
import { UserModel } from '@api/modules/auth/models/user.model';

// ── Helpers ───────────────────────────────────────────────────────────────────

const TEST_USER_ID = '507f1f77bcf86cd799439011';

/** Generate a valid Bearer token for the test user */
function makeToken(): string {
  return jwt.sign(
    { userId: TEST_USER_ID, role: 'DOCTOR', clinicId: 'clinic123' },
    'test-access-secret',
    { expiresIn: '15m', issuer: 'health-watchers-api', audience: 'health-watchers-client' },
  );
}

/** A mock user document returned by UserModel.findById().select() */
function makeMockUser(overrides: Record<string, unknown> = {}) {
  return {
    _id: TEST_USER_ID,
    id: TEST_USER_ID,
    password: '$2a$12$hashedpassword',
    refreshTokenHash: 'some-hash',
    save: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

/** Set up UserModel.findById to return a mock user via chained .select() */
function mockFindById(user: ReturnType<typeof makeMockUser> | null) {
  (UserModel.findById as jest.Mock).mockReturnValue({
    select: jest.fn().mockResolvedValue(user),
  });
}

const VALID_BODY = {
  currentPassword: 'OldPass1!',
  newPassword: 'NewPass1!',
  confirmPassword: 'NewPass1!',
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('PATCH /api/v1/auth/me/password', () => {
  const token = makeToken();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ── 1. No Authorization header → 401 ─────────────────────────────────────

  describe('1. Authentication required', () => {
    it('returns 401 when no Authorization header is provided', async () => {
      const res = await request(app)
        .patch('/api/v1/auth/me/password')
        .send(VALID_BODY);

      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Unauthorized');
    });

    it('returns 401 when Authorization header is malformed (not Bearer)', async () => {
      const res = await request(app)
        .patch('/api/v1/auth/me/password')
        .set('Authorization', 'Basic sometoken')
        .send(VALID_BODY);

      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Unauthorized');
    });

    it('returns 401 when Bearer token is invalid/expired', async () => {
      const res = await request(app)
        .patch('/api/v1/auth/me/password')
        .set('Authorization', 'Bearer this.is.not.a.valid.token')
        .send(VALID_BODY);

      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Unauthorized');
    });
  });

  // ── 2. Missing body fields → 400 ─────────────────────────────────────────

  describe('1. Missing body fields', () => {
    it('returns 400 when currentPassword is missing', async () => {
      const res = await request(app)
        .patch('/api/v1/auth/me/password')
        .set('Authorization', `Bearer ${token}`)
        .send({ newPassword: 'NewPass1!', confirmPassword: 'NewPass1!' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('ValidationError');
    });

    it('returns 400 when newPassword is missing', async () => {
      const res = await request(app)
        .patch('/api/v1/auth/me/password')
        .set('Authorization', `Bearer ${token}`)
        .send({ currentPassword: 'OldPass1!', confirmPassword: 'NewPass1!' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('ValidationError');
    });

    it('returns 400 when confirmPassword is missing', async () => {
      const res = await request(app)
        .patch('/api/v1/auth/me/password')
        .set('Authorization', `Bearer ${token}`)
        .send({ currentPassword: 'OldPass1!', newPassword: 'NewPass1!' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('ValidationError');
    });

    it('returns 400 when body is empty', async () => {
      const res = await request(app)
        .patch('/api/v1/auth/me/password')
        .set('Authorization', `Bearer ${token}`)
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('ValidationError');
    });
  });

  // ── 2. newPassword complexity rules → 400 ────────────────────────────────

  describe('2. newPassword complexity rules', () => {
    it('returns 400 when newPassword is fewer than 8 characters', async () => {
      const res = await request(app)
        .patch('/api/v1/auth/me/password')
        .set('Authorization', `Bearer ${token}`)
        .send({ ...VALID_BODY, newPassword: 'Ab1!', confirmPassword: 'Ab1!' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('ValidationError');
      expect(res.body.message).toContain('at least 8 characters');
    });

    it('returns 400 when newPassword has no digit', async () => {
      const res = await request(app)
        .patch('/api/v1/auth/me/password')
        .set('Authorization', `Bearer ${token}`)
        .send({ ...VALID_BODY, newPassword: 'NoDigits!A', confirmPassword: 'NoDigits!A' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('ValidationError');
      expect(res.body.message).toContain('digit');
    });

    it('returns 400 when newPassword has no uppercase letter', async () => {
      const res = await request(app)
        .patch('/api/v1/auth/me/password')
        .set('Authorization', `Bearer ${token}`)
        .send({ ...VALID_BODY, newPassword: 'nouppercase1!', confirmPassword: 'nouppercase1!' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('ValidationError');
      expect(res.body.message).toContain('uppercase');
    });

    it('returns 400 when newPassword has no lowercase letter', async () => {
      const res = await request(app)
        .patch('/api/v1/auth/me/password')
        .set('Authorization', `Bearer ${token}`)
        .send({ ...VALID_BODY, newPassword: 'NOLOWER1!', confirmPassword: 'NOLOWER1!' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('ValidationError');
      expect(res.body.message).toContain('lowercase');
    });

    it('returns 400 when newPassword has no special character', async () => {
      const res = await request(app)
        .patch('/api/v1/auth/me/password')
        .set('Authorization', `Bearer ${token}`)
        .send({ ...VALID_BODY, newPassword: 'NoSpecial1A', confirmPassword: 'NoSpecial1A' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('ValidationError');
      expect(res.body.message).toContain('special character');
    });
  });

  // ── 3. Wrong currentPassword → 401 ───────────────────────────────────────

  describe('3. Wrong currentPassword', () => {
    it('returns 401 with correct error body when currentPassword is wrong', async () => {
      const mockUser = makeMockUser();
      mockFindById(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      const res = await request(app)
        .patch('/api/v1/auth/me/password')
        .set('Authorization', `Bearer ${token}`)
        .send(VALID_BODY);

      expect(res.status).toBe(401);
      expect(res.body).toEqual({
        error: 'Unauthorized',
        message: 'Current password is incorrect',
      });
    });
  });

  // ── 4. newPassword !== confirmPassword → 400 ─────────────────────────────

  describe('4. Passwords do not match', () => {
    it('returns 400 with correct error body when passwords do not match', async () => {
      const mockUser = makeMockUser();
      mockFindById(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      const res = await request(app)
        .patch('/api/v1/auth/me/password')
        .set('Authorization', `Bearer ${token}`)
        .send({ ...VALID_BODY, confirmPassword: 'DifferentPass1!' });

      expect(res.status).toBe(400);
      expect(res.body).toEqual({
        error: 'BadRequest',
        message: 'Passwords do not match',
      });
    });
  });

  // ── 5. Valid request → 200 ────────────────────────────────────────────────

  describe('5. Valid request', () => {
    it('returns 200 with success body on valid request', async () => {
      const mockUser = makeMockUser();
      mockFindById(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      const res = await request(app)
        .patch('/api/v1/auth/me/password')
        .set('Authorization', `Bearer ${token}`)
        .send(VALID_BODY);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        status: 'success',
        data: { message: 'Password updated successfully' },
      });
    });
  });

  // ── 6. Success response contains no credential fields ────────────────────

  describe('6. Response body contains no credential fields', () => {
    it('does not include password, hash, or refreshTokenHash in the response', async () => {
      const mockUser = makeMockUser();
      mockFindById(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      const res = await request(app)
        .patch('/api/v1/auth/me/password')
        .set('Authorization', `Bearer ${token}`)
        .send(VALID_BODY);

      expect(res.status).toBe(200);
      const body = JSON.stringify(res.body);
      expect(body).not.toContain('"password"');
      expect(body).not.toContain('"hash"');
      expect(body).not.toContain('"refreshTokenHash"');
    });
  });

  // ── 7. refreshTokenHash is undefined after successful change ─────────────

  describe('7. refreshTokenHash cleared after successful change', () => {
    it('sets refreshTokenHash to undefined on the user document before save', async () => {
      const mockUser = makeMockUser({ refreshTokenHash: 'existing-hash' });
      mockFindById(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      await request(app)
        .patch('/api/v1/auth/me/password')
        .set('Authorization', `Bearer ${token}`)
        .send(VALID_BODY);

      expect(mockUser.refreshTokenHash).toBeUndefined();
      expect(mockUser.save).toHaveBeenCalled();
    });
  });
});
