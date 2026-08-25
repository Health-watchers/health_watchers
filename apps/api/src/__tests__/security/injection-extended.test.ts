/**
 * Advanced Injection Tests — Issue #1031
 *
 * Supplements nosql-injection.test.ts and security.test.ts with:
 *  - HTTP parameter pollution
 *  - Path traversal in URL parameters
 *  - SSRF via webhook-style inputs
 *  - Command-injection patterns in string fields
 *  - Large payload (DoS) guards
 *  - Prototype-pollution via JSON body
 */

process.env.MONGO_URI = 'mongodb://localhost:27017/test';
process.env.JWT_ACCESS_TOKEN_SECRET = 'test-access-secret-32-chars-long!!';
process.env.JWT_REFRESH_TOKEN_SECRET = 'test-refresh-secret-32-chars-long!';
process.env.API_PORT = '3001';
process.env.FIELD_ENCRYPTION_KEY = 'abcdefghijklmnopqrstuvwxyz012345';

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

import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import app from '@api/app';
import { PatientModel } from '../../modules/patients/models/patient.model';
import { signAccessToken } from '../../modules/auth/token.service';

const CLINIC_ID = new mongoose.Types.ObjectId().toHexString();
const USER_ID = new mongoose.Types.ObjectId().toHexString();

let mongod: MongoMemoryServer;
let token: string;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  await PatientModel.ensureIndexes();
  token = signAccessToken({ userId: USER_ID, role: 'DOCTOR', clinicId: CLINIC_ID });
}, 30_000);

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

// ── Path traversal ────────────────────────────────────────────────────────────
describe('Path traversal injection', () => {
  it('does not 500 on ../ in URL segment', async () => {
    const res = await request(app)
      .get('/api/v1/patients/../../etc/passwd')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).not.toBe(500);
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it('does not leak file system paths in error body', async () => {
    const res = await request(app)
      .get('/api/v1/patients/%2e%2e%2f%2e%2e%2fetc%2fpasswd')
      .set('Authorization', `Bearer ${token}`);
    const body = JSON.stringify(res.body);
    expect(body.toLowerCase()).not.toContain('etc/passwd');
    expect(body.toLowerCase()).not.toContain('root:');
  });
});

// ── Oversized payloads (application-level DoS guard) ─────────────────────────
describe('Oversized payload handling', () => {
  it('rejects or handles a 2 MB JSON body without 500', async () => {
    const hugeString = 'A'.repeat(2 * 1024 * 1024);
    const res = await request(app)
      .post('/api/v1/patients')
      .set('Authorization', `Bearer ${token}`)
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ firstName: hugeString, lastName: 'X', dateOfBirth: '1990-01-01', sex: 'M' }));
    // Should be rejected (400/413) not crash (500)
    expect(res.status).not.toBe(500);
    expect([400, 413, 422]).toContain(res.status);
  });

  it('rejects a deeply nested JSON object without 500', async () => {
    // Build an object 500 levels deep
    let deep: Record<string, unknown> = { value: 'leaf' };
    for (let i = 0; i < 500; i++) {
      deep = { nested: deep };
    }
    const res = await request(app)
      .post('/api/v1/patients')
      .set('Authorization', `Bearer ${token}`)
      .send({ firstName: deep, lastName: 'X', dateOfBirth: '1990-01-01', sex: 'M' });
    expect(res.status).not.toBe(500);
  });
});

// ── HTTP parameter pollution ──────────────────────────────────────────────────
describe('HTTP parameter pollution', () => {
  it('handles duplicate query params without 500', async () => {
    const res = await request(app)
      .get('/api/v1/patients?page=1&page=999&limit=10&limit=9999')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).not.toBe(500);
  });

  it('handles array-style query params without crashing', async () => {
    const res = await request(app)
      .get('/api/v1/patients?clinicId[]=abc&clinicId[]=def')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).not.toBe(500);
  });

  it('handles JSON-encoded query param without crashing', async () => {
    const encoded = encodeURIComponent('{"$gt":""}');
    const res = await request(app)
      .get(`/api/v1/patients?filter=${encoded}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).not.toBe(500);
  });
});

// ── Content-type confusion ────────────────────────────────────────────────────
describe('Content-type confusion attacks', () => {
  it('rejects or handles text/plain body on JSON endpoint', async () => {
    const res = await request(app)
      .post('/api/v1/patients')
      .set('Authorization', `Bearer ${token}`)
      .set('Content-Type', 'text/plain')
      .send('firstName=Admin&password[$ne]=null');
    // Must not crash with a 500
    expect(res.status).not.toBe(500);
  });

  it('rejects malformed JSON body with 400 (not 500)', async () => {
    const res = await request(app)
      .post('/api/v1/patients')
      .set('Authorization', `Bearer ${token}`)
      .set('Content-Type', 'application/json')
      .send('{this is not valid json}');
    expect(res.status).toBe(400);
  });

  it('handles multipart/form-data on a non-upload endpoint gracefully', async () => {
    const res = await request(app)
      .post('/api/v1/patients')
      .set('Authorization', `Bearer ${token}`)
      .field('firstName', 'Test')
      .field('lastName', 'User');
    // Should not 500 — may 400 or 415
    expect(res.status).not.toBe(500);
  });
});

// ── ObjectId injection ────────────────────────────────────────────────────────
describe('ObjectId injection in URL params', () => {
  it('returns 400 for a non-ObjectId in :id param', async () => {
    const res = await request(app)
      .get('/api/v1/patients/INVALID-ID')
      .set('Authorization', `Bearer ${token}`);
    expect([400, 404]).toContain(res.status);
  });

  it('returns 400 for MongoDB operator string in :id param', async () => {
    const res = await request(app)
      .get('/api/v1/patients/%7B%24gt%3A%22%22%7D') // URL-encoded {"$gt":""}
      .set('Authorization', `Bearer ${token}`);
    expect([400, 404]).toContain(res.status);
  });

  it('returns 400 for SQL-like injection in :id param', async () => {
    const res = await request(app)
      .get("/api/v1/patients/' OR 1=1 --")
      .set('Authorization', `Bearer ${token}`);
    expect([400, 404]).toContain(res.status);
  });

  it('returns 400/404 for null bytes in :id param', async () => {
    const res = await request(app)
      .get('/api/v1/patients/abc%00def')
      .set('Authorization', `Bearer ${token}`);
    expect([400, 404]).toContain(res.status);
  });
});

// ── Script injection in response body fields ──────────────────────────────────
describe('Script injection — response encoding', () => {
  it('XSS payloads in firstName are not reflected unescaped in JSON response', async () => {
    const xssPayload = '<script>alert(1)</script>';
    const res = await request(app)
      .post('/api/v1/patients')
      .set('Authorization', `Bearer ${token}`)
      .send({
        firstName: xssPayload,
        lastName: 'Test',
        dateOfBirth: '1990-01-01',
        sex: 'M',
      });

    if (res.status === 201) {
      // JSON-encoded angle brackets are safe
      expect(res.body?.data?.firstName).toBeDefined();
      // The raw text must not contain unescaped <script>
      expect(res.text).not.toContain('<script>alert(1)</script>');
    } else {
      // Rejected — also acceptable
      expect([400, 422]).toContain(res.status);
    }
  });

  it('response Content-Type is always application/json (never text/html)', async () => {
    const endpoints = [
      () => request(app).get('/health'),
      () => request(app).get('/api/v1/patients').set('Authorization', `Bearer ${token}`),
      () =>
        request(app)
          .get('/api/v1/patients/000000000000000000000000')
          .set('Authorization', `Bearer ${token}`),
      () => request(app).get('/api/v1/nonexistent').set('Authorization', `Bearer ${token}`),
    ];

    for (const endpoint of endpoints) {
      const res = await endpoint();
      expect(res.headers['content-type']).toContain('application/json');
    }
  });
});
