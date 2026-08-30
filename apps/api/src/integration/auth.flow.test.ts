/**
 * Integration tests — authentication workflows.
 *
 * Exercises the real auth controller against an in-memory MongoDB:
 *   - login / failed login
 *   - refresh token rotation + replay detection
 *   - register (role-based creation) + protected-route enforcement
 */
process.env.MONGO_URI = 'mongodb://localhost:27017/test';
process.env.JWT_ACCESS_TOKEN_SECRET = 'test-access-secret-32-chars-long!!';
process.env.JWT_REFRESH_TOKEN_SECRET = 'test-refresh-secret-32-chars-long!';
process.env.API_PORT = '3001';
process.env.NODE_ENV = 'test';

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
  },
}));

jest.mock('@api/utils/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

// email.service — every export is a jest.fn (sendVerificationEmail,
// sendWelcomeEmail, sendAccountLockedEmail, ...) so no SMTP is attempted.
jest.mock('@api/lib/email.service', () => {
  const handler = {
    get: (_target: unknown, prop: string | symbol) =>
      typeof prop === 'string' ? jest.fn() : undefined,
  };
  return new Proxy({}, handler);
});

import express from 'express';
import request from 'supertest';
import { authRoutes } from '../modules/auth/auth.controller';
import { startTestDb, stopTestDb, clearDb, TestDb } from './helpers/test-db';
import { createClinicWithAdmin, makeAccessToken } from './helpers/factories';

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/v1/auth', authRoutes);
  return app;
}

describe('auth integration flows', () => {
  let testDb: TestDb;
  let app: express.Express;

  beforeAll(async () => {
    testDb = await startTestDb();
    app = buildApp();
  });

  afterEach(async () => {
    await clearDb();
  });

  afterAll(async () => {
    await stopTestDb(testDb);
  });

  describe('POST /api/v1/auth/login', () => {
    it('returns access + refresh tokens for valid credentials', async () => {
      const { admin } = await createClinicWithAdmin({ password: 'StrongPass123!' });

      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: admin.email, password: 'StrongPass123!' });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(res.body.data.accessToken).toBeDefined();
      expect(res.body.data.refreshToken).toBeDefined();
    });

    it('rejects a wrong password', async () => {
      const { admin } = await createClinicWithAdmin({ password: 'StrongPass123!' });

      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: admin.email, password: 'WrongPassword!' });

      expect(res.status).toBe(401);
    });

    it('rejects an unknown email', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'nobody@example.com', password: 'Whatever123!' });

      expect(res.status).toBe(401);
    });
  });

  describe('POST /api/v1/auth/refresh', () => {
    it('rotates the refresh token and issues new tokens', async () => {
      const { admin } = await createClinicWithAdmin({ password: 'StrongPass123!' });
      const login = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: admin.email, password: 'StrongPass123!' });
      const refreshToken = login.body.data.refreshToken;

      const res = await request(app).post('/api/v1/auth/refresh').send({ refreshToken });

      expect(res.status).toBe(200);
      expect(res.body.data.accessToken).toBeDefined();
      expect(res.body.data.refreshToken).toBeDefined();
      expect(res.body.data.refreshToken).not.toBe(refreshToken);
    });

    it('revokes the whole family when a consumed token is replayed', async () => {
      const { admin } = await createClinicWithAdmin({ password: 'StrongPass123!' });
      const login = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: admin.email, password: 'StrongPass123!' });
      const refreshToken = login.body.data.refreshToken;

      await request(app).post('/api/v1/auth/refresh').send({ refreshToken });

      const replay = await request(app).post('/api/v1/auth/refresh').send({ refreshToken });
      expect(replay.status).toBe(401);
      expect(replay.body.message).toMatch(/reuse|revoked/i);
    });

    it('rejects a garbage refresh token', async () => {
      const res = await request(app)
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: 'not-a-real-token' });
      expect(res.status).toBe(401);
    });
  });

  describe('POST /api/v1/auth/register', () => {
    it('requires authentication', async () => {
      const res = await request(app).post('/api/v1/auth/register').send({
        fullName: 'Dr. X',
        email: 'dr.x@example.com',
        password: 'StrongPass123!',
        role: 'DOCTOR',
        clinicId: '507f1f77bcf86cd799439011',
      });
      expect(res.status).toBe(401);
    });

    it('lets a CLINIC_ADMIN create a DOCTOR account', async () => {
      const { clinic, admin } = await createClinicWithAdmin();
      const token = makeAccessToken({
        userId: admin._id.toString(),
        role: 'CLINIC_ADMIN',
        clinicId: clinic._id.toString(),
      });

      const res = await request(app)
        .post('/api/v1/auth/register')
        .set('Authorization', `Bearer ${token}`)
        .send({
          fullName: 'Dr. Smith',
          email: 'dr.smith@example.com',
          password: 'StrongPass123!',
          role: 'DOCTOR',
          clinicId: clinic._id.toString(),
        });

      expect(res.status).toBe(201);
      expect(res.body.data.email).toBe('dr.smith@example.com');
      expect(res.body.data.role).toBe('DOCTOR');
    });

    it('forbids creating a SUPER_ADMIN as a CLINIC_ADMIN', async () => {
      const { clinic, admin } = await createClinicWithAdmin();
      const token = makeAccessToken({
        userId: admin._id.toString(),
        role: 'CLINIC_ADMIN',
        clinicId: clinic._id.toString(),
      });

      const res = await request(app)
        .post('/api/v1/auth/register')
        .set('Authorization', `Bearer ${token}`)
        .send({
          fullName: 'Bad Admin',
          email: 'bad.admin@example.com',
          password: 'StrongPass123!',
          role: 'SUPER_ADMIN',
          clinicId: clinic._id.toString(),
        });

      expect(res.status).toBe(403);
    });

    it('returns 400 for a duplicate email', async () => {
      const { clinic, admin } = await createClinicWithAdmin();
      const token = makeAccessToken({
        userId: admin._id.toString(),
        role: 'CLINIC_ADMIN',
        clinicId: clinic._id.toString(),
      });
      const payload = {
        fullName: 'Dr. Dup',
        email: 'dr.dup@example.com',
        password: 'StrongPass123!',
        role: 'DOCTOR',
        clinicId: clinic._id.toString(),
      };

      await request(app)
        .post('/api/v1/auth/register')
        .set('Authorization', `Bearer ${token}`)
        .send(payload);

      const dup = await request(app)
        .post('/api/v1/auth/register')
        .set('Authorization', `Bearer ${token}`)
        .send(payload);

      expect(dup.status).toBe(409);
    });
  });
});
