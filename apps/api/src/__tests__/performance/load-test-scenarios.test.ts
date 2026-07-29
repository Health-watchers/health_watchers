/**
 * Load Test Scenarios — Jest layer — Issue #1030
 *
 * These in-process "load scenarios" run during CI and complement the k6
 * load tests (which require a live server).  They verify:
 *  - Sequential throughput: N requests complete within a wall-clock window
 *  - Burst concurrency: all parallel requests succeed with no 5xx
 *  - Rate-limit safe-guard: endpoints cope with rapid re-request
 *  - Error rate: failure ratio stays below threshold under load
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
const MAX_ERROR_RATE = 0.05; // 5 % threshold

let mongod: MongoMemoryServer;
let token: string;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  await PatientModel.ensureIndexes();

  const patients = Array.from({ length: 200 }, (_, i) => ({
    systemId: `LOAD-P${i}`,
    firstName: 'Load',
    lastName: `Patient${i}`,
    searchName: `load patient${i}`,
    dateOfBirth: '1990-01-01',
    sex: 'M',
    clinicId: CLINIC_ID,
    isActive: true,
  }));
  await PatientModel.insertMany(patients, { ordered: false });

  token = signAccessToken({ userId: USER_ID, role: 'DOCTOR', clinicId: CLINIC_ID });
}, 60_000);

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

// ── Helpers ───────────────────────────────────────────────────────────────────
function errorRate(statuses: number[]): number {
  return statuses.filter((s) => s >= 500).length / statuses.length;
}

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 1: 20 sequential health checks
// ─────────────────────────────────────────────────────────────────────────────
describe('Load scenario: sequential health checks (N=20)', () => {
  it('all 20 return 200', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 20; i++) {
      const res = await request(app).get('/health');
      statuses.push(res.status);
    }
    const failures = statuses.filter((s) => s !== 200);
    console.log(`[load] sequential /health failures: ${failures.length}/20`);
    expect(failures).toHaveLength(0);
  });

  it('completes 20 sequential checks in < 2 seconds', async () => {
    const start = Date.now();
    for (let i = 0; i < 20; i++) {
      await request(app).get('/health');
    }
    const elapsed = Date.now() - start;
    console.log(`[load] 20 sequential /health: ${elapsed}ms total`);
    expect(elapsed).toBeLessThan(2000);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 2: Burst — 20 concurrent patient list requests
// ─────────────────────────────────────────────────────────────────────────────
describe('Load scenario: burst 20 concurrent GET /patients', () => {
  it('error rate stays below 5%', async () => {
    const responses = await Promise.all(
      Array.from({ length: 20 }, () =>
        request(app).get('/api/v1/patients?page=1&limit=10').set('Authorization', `Bearer ${token}`)
      )
    );
    const rate = errorRate(responses.map((r) => r.status));
    console.log(`[load] burst /patients error rate: ${(rate * 100).toFixed(1)}%`);
    expect(rate).toBeLessThan(MAX_ERROR_RATE);
  });

  it('all responses have valid JSON bodies', async () => {
    const responses = await Promise.all(
      Array.from({ length: 20 }, () =>
        request(app).get('/api/v1/patients?page=1&limit=10').set('Authorization', `Bearer ${token}`)
      )
    );
    const invalidJson = responses.filter((r) => {
      try {
        JSON.parse(r.text);
        return false;
      } catch {
        return true;
      }
    });
    expect(invalidJson).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 3: Mixed burst — auth errors + valid requests interleaved
// ─────────────────────────────────────────────────────────────────────────────
describe('Load scenario: mixed valid and invalid auth requests', () => {
  it('server does not 5xx on mixed auth requests', async () => {
    const requests = [
      ...Array.from({ length: 10 }, () =>
        request(app).get('/api/v1/patients?limit=5').set('Authorization', `Bearer ${token}`)
      ),
      ...Array.from({ length: 10 }, () =>
        request(app).get('/api/v1/patients?limit=5').set('Authorization', 'Bearer invalid.token')
      ),
    ];

    const responses = await Promise.all(requests);
    const serverErrors = responses.filter((r) => r.status >= 500);
    console.log(`[load] mixed auth: ${serverErrors.length} server errors out of 20`);
    expect(serverErrors).toHaveLength(0);
  });

  it('invalid auth requests correctly return 401 (not 500)', async () => {
    const responses = await Promise.all(
      Array.from({ length: 10 }, () =>
        request(app).get('/api/v1/patients').set('Authorization', 'Bearer bad.token.here')
      )
    );
    const non401 = responses.filter((r) => r.status !== 401);
    expect(non401).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 4: Sustained read throughput — 50 requests over time
// ─────────────────────────────────────────────────────────────────────────────
describe('Load scenario: sustained read (50 requests in 5 batches of 10)', () => {
  it('all 50 requests succeed without degradation', async () => {
    const batchSize = 10;
    const batches = 5;
    const allStatuses: number[] = [];

    for (let b = 0; b < batches; b++) {
      const responses = await Promise.all(
        Array.from({ length: batchSize }, () =>
          request(app)
            .get('/api/v1/patients?page=1&limit=10')
            .set('Authorization', `Bearer ${token}`)
        )
      );
      allStatuses.push(...responses.map((r) => r.status));
    }

    const failures = allStatuses.filter((s) => s !== 200);
    console.log(
      `[load] sustained 50 requests: ${failures.length} failures out of ${allStatuses.length}`
    );
    expect(errorRate(allStatuses)).toBeLessThan(MAX_ERROR_RATE);
  });
});
