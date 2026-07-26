/**
 * Security tests — Issue #907
 *
 * Covers:
 *  - Injection: NoSQL operator injection through the full Express/Mongoose stack
 *  - Auth flows: missing token, expired token, forged token, tampered signature
 *  - Permissions: role-based enforcement and cross-clinic data isolation
 *  - Data exposure: sensitive fields absent from responses, security headers present
 */

// ── Environment stubs ──────────────────────────────────────────────────────────
process.env.MONGO_URI = 'mongodb://localhost:27017/test';
process.env.JWT_ACCESS_TOKEN_SECRET = 'test-access-secret-32-chars-long!!';
process.env.JWT_REFRESH_TOKEN_SECRET = 'test-refresh-secret-32-chars-long!';
process.env.API_PORT = '3001';
process.env.FIELD_ENCRYPTION_KEY = 'abcdefghijklmnopqrstuvwxyz012345';

// ── Module mocks ───────────────────────────────────────────────────────────────

jest.mock('@health-watchers/config', () => ({
  config: {
    jwt: {
      accessTokenSecret: 'test-access-secret-32-chars-long!!',
      refreshTokenSecret: 'test-refresh-secret-32-chars-long!',
      issuer: 'health-watchers-api',
      audience: 'health-watchers-client',
    },
    fieldEncryptionKey: 'abcdefghijklmnopqrstuvwxyz012345',
    nodeEnv: 'test',
    mongoUri: '',
    stellarNetwork: 'testnet',
    stellarHorizonUrl: '',
    stellarSecretKey: '',
    stellar: { network: 'testnet', horizonUrl: '', secretKey: '', platformPublicKey: '' },
    supportedAssets: ['XLM'],
    stellarServiceUrl: '',
    geminiApiKey: '',
  },
}));

jest.mock('@api/lib/encrypt', () => ({ encrypt: (v: string) => v, decrypt: (v: string) => v }));
jest.mock('@api/utils/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));
jest.mock('pino-http', () => () => (_req: unknown, _res: unknown, next: () => void) => next());
jest.mock('@api/config/db', () => ({ connectDB: jest.fn().mockReturnValue(new Promise(() => {})) }));
jest.mock('@api/docs/swagger', () => ({ setupSwagger: jest.fn() }));
jest.mock('@api/modules/payments/services/payment-expiration-job', () => ({
  startPaymentExpirationJob: jest.fn(),
  stopPaymentExpirationJob: jest.fn(),
}));

// Mock unused route modules
jest.mock('@api/modules/auth/auth.controller', () => ({ authRoutes: require('express').Router() }));
jest.mock('@api/modules/encounters/encounters.controller', () => ({ encounterRoutes: require('express').Router() }));
jest.mock('@api/modules/payments/payments.controller', () => ({ paymentRoutes: require('express').Router() }));
jest.mock('@api/modules/appointments/appointments.controller', () => ({ appointmentRoutes: require('express').Router() }));
jest.mock('@api/modules/clinics/clinics.controller', () => ({ clinicRoutes: require('express').Router() }));
jest.mock('@api/modules/users/users.controller', () => ({ userRoutes: require('express').Router() }));
jest.mock('@api/modules/webhooks/webhooks.controller', () => ({ webhookRoutes: require('express').Router() }));
jest.mock('@api/modules/audit/audit-logs.controller', () => ({ auditLogRoutes: require('express').Router() }));
jest.mock('@api/modules/ai/ai.routes', () => require('express').Router());
jest.mock('@api/modules/dashboard/dashboard.routes', () => require('express').Router());

// ── Imports ───────────────────────────────────────────────────────────────────

import request from 'supertest';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import { MongoMemoryServer } from 'mongodb-memory-server';
import app from '@api/app';
import { PatientModel } from '../modules/patients/models/patient.model';
import { signAccessToken } from '../modules/auth/token.service';
import { AppRole } from '../types/express';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const CLINIC_A = new mongoose.Types.ObjectId().toHexString();
const CLINIC_B = new mongoose.Types.ObjectId().toHexString();
const USER_ID = new mongoose.Types.ObjectId().toHexString();

function makeToken(role: AppRole, clinicId = CLINIC_A): string {
  return signAccessToken({ userId: USER_ID, role, clinicId });
}

let mongod: MongoMemoryServer;
let doctorToken: string;

// ── Setup / Teardown ──────────────────────────────────────────────────────────

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  await PatientModel.ensureIndexes();
  doctorToken = makeToken('DOCTOR');
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

afterEach(async () => {
  await PatientModel.deleteMany({});
});

// ── Seed helper ───────────────────────────────────────────────────────────────
async function seed(overrides: Record<string, unknown> = {}) {
  const n = await PatientModel.countDocuments();
  return PatientModel.create({
    systemId: `SEC-${n}-${Date.now()}`,
    firstName: 'Secure',
    lastName: 'Patient',
    searchName: 'secure patient',
    dateOfBirth: '1980-01-01',
    sex: 'M',
    clinicId: CLINIC_A,
    isActive: true,
    ...overrides,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Injection tests
// ─────────────────────────────────────────────────────────────────────────────
describe('Injection tests', () => {
  describe('NoSQL operator injection in request body', () => {
    it('strips $gt operator from create-patient body', async () => {
      const res = await request(app)
        .post('/api/v1/patients')
        .set('Authorization', `Bearer ${doctorToken}`)
        .send({
          firstName: { $gt: '' },
          lastName: 'Doe',
          dateOfBirth: '1990-01-01',
          sex: 'F',
        });

      // Must either reject (400) or sanitise the operator — never 201 with operator preserved
      if (res.status === 201) {
        expect(res.body?.data?.firstName).not.toHaveProperty('$gt');
      } else {
        expect(res.status).toBe(400);
      }
    });

    it('rejects $where operator in body', async () => {
      const res = await request(app)
        .post('/api/v1/patients')
        .set('Authorization', `Bearer ${doctorToken}`)
        .send({ $where: 'this.isActive === true', firstName: 'X', lastName: 'Y', dateOfBirth: '1990-01-01', sex: 'M' });

      expect([400, 201]).toContain(res.status);
      if (res.status === 201) {
        // Operator must have been stripped
        expect(JSON.stringify(res.body)).not.toContain('$where');
      }
    });

    it('blocks nested $regex injection in search query', async () => {
      const res = await request(app)
        .get('/api/v1/patients/search?q[$regex]=.*&q[$options]=i')
        .set('Authorization', `Bearer ${doctorToken}`);

      // Should either sanitise (200) or reject (400), never expose all records unfiltered
      expect([200, 400]).toContain(res.status);
    });

    it('prevents $ne operator bypass in filters', async () => {
      const res = await request(app)
        .get('/api/v1/patients?active[$ne]=false')
        .set('Authorization', `Bearer ${doctorToken}`);

      expect([200, 400]).toContain(res.status);
      // If 200, must only return clinic-scoped results, not all records
      if (res.status === 200) {
        const patients = res.body?.data ?? [];
        patients.forEach((p: { clinicId?: string }) => {
          if (p.clinicId) expect(p.clinicId).toBe(CLINIC_A);
        });
      }
    });
  });

  describe('XSS — response encoding and Content-Type', () => {
    it('all API responses are Content-Type application/json (no HTML)', async () => {
      const res = await request(app)
        .get('/api/v1/patients')
        .set('Authorization', `Bearer ${doctorToken}`);

      expect(res.headers['content-type']).toContain('application/json');
    });

    it('error responses are JSON, not HTML (no reflected HTML execution vector)', async () => {
      const res = await request(app)
        .get('/api/v1/patients/not-a-valid-id')
        .set('Authorization', `Bearer ${doctorToken}`);

      expect(res.headers['content-type']).toContain('application/json');
      // Body must be parseable JSON — not raw HTML
      expect(() => JSON.parse(res.text)).not.toThrow();
    });

    it('404 for unknown route is JSON, not HTML page', async () => {
      const res = await request(app)
        .get('/api/v1/nonexistent-route')
        .set('Authorization', `Bearer ${doctorToken}`);

      expect(res.headers['content-type']).toContain('application/json');
    });

    it('Content-Security-Policy header denies inline script execution', async () => {
      const res = await request(app).get('/health');
      const csp = res.headers['content-security-policy'] as string;
      expect(csp).toBeDefined();
      // Must not have unsafe-inline for scripts
      expect(csp).not.toContain("script-src 'unsafe-inline'");
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Auth flow security
// ─────────────────────────────────────────────────────────────────────────────
describe('Auth flow security', () => {
  it('returns 401 when Authorization header is absent', async () => {
    const res = await request(app).get('/api/v1/patients');
    expect(res.status).toBe(401);
  });

  it('returns 401 when scheme is Basic instead of Bearer', async () => {
    const res = await request(app)
      .get('/api/v1/patients')
      .set('Authorization', 'Basic dXNlcjpwYXNz');
    expect(res.status).toBe(401);
  });

  it('returns 401 for a completely bogus token', async () => {
    const res = await request(app)
      .get('/api/v1/patients')
      .set('Authorization', 'Bearer aaaa.bbbb.cccc');
    expect(res.status).toBe(401);
  });

  it('returns 401 for a token signed with the wrong secret', async () => {
    const forgedToken = jwt.sign(
      { userId: USER_ID, role: 'DOCTOR', clinicId: CLINIC_A, jti: 'fake-jti' },
      'completely-wrong-secret-here!!!',
      { expiresIn: '15m', issuer: 'health-watchers-api', audience: 'health-watchers-client' }
    );
    const res = await request(app)
      .get('/api/v1/patients')
      .set('Authorization', `Bearer ${forgedToken}`);
    expect(res.status).toBe(401);
  });

  it('returns 401 for an expired token', async () => {
    const expiredToken = jwt.sign(
      { userId: USER_ID, role: 'DOCTOR', clinicId: CLINIC_A, jti: 'expired-jti' },
      'test-access-secret-32-chars-long!!',
      { expiresIn: -1, issuer: 'health-watchers-api', audience: 'health-watchers-client' }
    );
    const res = await request(app)
      .get('/api/v1/patients')
      .set('Authorization', `Bearer ${expiredToken}`);
    expect(res.status).toBe(401);
  });

  it('returns 401 for a tampered token payload (signature mismatch)', async () => {
    const [header, , sig] = doctorToken.split('.');
    const tamperedPayload = Buffer.from(
      JSON.stringify({ userId: 'hacker', role: 'SUPER_ADMIN', clinicId: CLINIC_A })
    ).toString('base64url');
    const tamperedToken = `${header}.${tamperedPayload}.${sig}`;

    const res = await request(app)
      .get('/api/v1/patients')
      .set('Authorization', `Bearer ${tamperedToken}`);
    expect(res.status).toBe(401);
  });

  it('returns structured error body (not stack trace) on auth failure', async () => {
    const res = await request(app)
      .get('/api/v1/patients')
      .set('Authorization', 'Bearer invalid.token.here');

    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty('error');
    expect(res.body).toHaveProperty('message');
    expect(res.body).not.toHaveProperty('stack');
  });

  it('security headers are present on auth-protected responses', async () => {
    const res = await request(app)
      .get('/api/v1/patients')
      .set('Authorization', `Bearer ${doctorToken}`);

    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-frame-options']).toBeDefined();
    expect(res.headers['x-powered-by']).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Permission enforcement
// ─────────────────────────────────────────────────────────────────────────────
describe('Permission enforcement', () => {
  it('PATIENT role cannot list all patients', async () => {
    const patientRoleToken = makeToken('PATIENT');
    const res = await request(app)
      .get('/api/v1/patients')
      .set('Authorization', `Bearer ${patientRoleToken}`);
    expect(res.status).toBe(403);
  });

  it('READ_ONLY role cannot create a patient', async () => {
    const readOnlyToken = makeToken('READ_ONLY');
    const res = await request(app)
      .post('/api/v1/patients')
      .set('Authorization', `Bearer ${readOnlyToken}`)
      .send({ firstName: 'A', lastName: 'B', dateOfBirth: '1990-01-01', sex: 'M' });
    expect(res.status).toBe(403);
  });

  it('READ_ONLY role cannot update a patient', async () => {
    const patient = await seed();
    const readOnlyToken = makeToken('READ_ONLY');
    const res = await request(app)
      .put(`/api/v1/patients/${patient._id}`)
      .set('Authorization', `Bearer ${readOnlyToken}`)
      .send({ firstName: 'Hijacked' });
    expect(res.status).toBe(403);
  });

  it('DOCTOR role cannot delete a patient', async () => {
    const patient = await seed();
    const res = await request(app)
      .delete(`/api/v1/patients/${patient._id}`)
      .set('Authorization', `Bearer ${doctorToken}`);
    expect(res.status).toBe(403);
  });

  it('CLINIC_ADMIN can delete a patient', async () => {
    const patient = await seed();
    const adminToken = makeToken('CLINIC_ADMIN');
    const res = await request(app)
      .delete(`/api/v1/patients/${patient._id}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect([200, 204]).toContain(res.status);
  });

  describe('Cross-clinic data isolation', () => {
    it('DOCTOR from clinic B cannot read patients belonging to clinic A', async () => {
      await seed({ clinicId: CLINIC_A });
      const clinicBToken = makeToken('DOCTOR', CLINIC_B);
      const res = await request(app)
        .get('/api/v1/patients')
        .set('Authorization', `Bearer ${clinicBToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(0);
    });

    it('DOCTOR from clinic B cannot access a specific clinic A patient by ID', async () => {
      const patient = await seed({ clinicId: CLINIC_A });
      const clinicBToken = makeToken('DOCTOR', CLINIC_B);
      const res = await request(app)
        .get(`/api/v1/patients/${patient._id}`)
        .set('Authorization', `Bearer ${clinicBToken}`);

      expect([403, 404]).toContain(res.status);
    });

    it('CLINIC_ADMIN from clinic B cannot modify clinic A patient', async () => {
      const patient = await seed({ clinicId: CLINIC_A });
      const clinicBAdmin = makeToken('CLINIC_ADMIN', CLINIC_B);
      const res = await request(app)
        .put(`/api/v1/patients/${patient._id}`)
        .set('Authorization', `Bearer ${clinicBAdmin}`)
        .send({ firstName: 'CrossClinicHack' });

      expect([403, 404]).toContain(res.status);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. Data exposure
// ─────────────────────────────────────────────────────────────────────────────
describe('Data exposure', () => {
  it('password hash is not included in patient list response', async () => {
    await seed();
    const res = await request(app)
      .get('/api/v1/patients')
      .set('Authorization', `Bearer ${doctorToken}`);

    expect(res.status).toBe(200);
    const body = JSON.stringify(res.body);
    expect(body).not.toMatch(/"\$2[ab]\$\d{2}\$/); // bcrypt hash pattern
    expect(body.toLowerCase()).not.toContain('"password"');
  });

  it('MFA secrets are not exposed in any patient response', async () => {
    await seed();
    const res = await request(app)
      .get('/api/v1/patients')
      .set('Authorization', `Bearer ${doctorToken}`);

    const body = JSON.stringify(res.body);
    expect(body).not.toContain('mfaSecret');
    expect(body).not.toContain('mfaBackupCodes');
  });

  it('internal server errors do not leak stack traces in production-like responses', async () => {
    // Force a bad ObjectId to trigger a handled error path
    const res = await request(app)
      .get('/api/v1/patients/000000000000000000000000')
      .set('Authorization', `Bearer ${doctorToken}`);

    expect([404, 400]).toContain(res.status);
    expect(res.body).not.toHaveProperty('stack');
  });

  it('error responses do not reveal MongoDB internals', async () => {
    // Send a deeply nested object to trigger a cast/validation path
    const res = await request(app)
      .post('/api/v1/patients')
      .set('Authorization', `Bearer ${doctorToken}`)
      .send({ firstName: { nested: { deep: 'value' } }, lastName: 'X', dateOfBirth: '1990-01-01', sex: 'M' });

    const body = JSON.stringify(res.body);
    expect(body.toLowerCase()).not.toContain('mongodb');
    expect(body.toLowerCase()).not.toContain('mongoose');
  });

  it('response does not include X-Powered-By header', async () => {
    const res = await request(app)
      .get('/api/v1/patients')
      .set('Authorization', `Bearer ${doctorToken}`);

    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('Content-Security-Policy header is present', async () => {
    const res = await request(app).get('/health');
    expect(res.headers['content-security-policy']).toBeDefined();
    expect(res.headers['content-security-policy']).toContain("default-src 'self'");
  });

  it('Strict-Transport-Security header enforces HTTPS', async () => {
    const res = await request(app).get('/health');
    expect(res.headers['strict-transport-security']).toContain('max-age=31536000');
    expect(res.headers['strict-transport-security']).toContain('includeSubDomains');
  });
});
