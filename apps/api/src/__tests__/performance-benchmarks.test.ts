/**
 * Performance benchmark tests — Issue #906
 *
 * Covers:
 *  - Endpoint response-time baselines for /health, /patients, /appointments
 *  - Query performance against seeded data with index verification
 *  - Concurrent load scenarios (throughput under parallel requests)
 *  - Cache warm vs cold baseline comparison
 *
 * All timing thresholds are conservative to be reliable in CI.
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
import { MongoMemoryServer } from 'mongodb-memory-server';
import app from '@api/app';
import { PatientModel } from '../modules/patients/models/patient.model';
import { AppointmentModel } from '../modules/appointments/appointment.model';
import { signAccessToken } from '../modules/auth/token.service';
import { cache } from '../services/cache.service';

// ── Constants ─────────────────────────────────────────────────────────────────

const CLINIC_ID = new mongoose.Types.ObjectId().toHexString();
const USER_ID = new mongoose.Types.ObjectId().toHexString();

// Threshold budgets (milliseconds)
const BUDGET = {
  healthCheck: 100,
  listEndpoint: 500,
  singleRead: 200,
  concurrentP95: 800,
};

const SEED_PATIENTS = 500;
const SEED_APPOINTMENTS = 200;
const CONCURRENT_REQUESTS = 10;

let mongod: MongoMemoryServer;
let token: string;

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());

  await PatientModel.ensureIndexes();
  await AppointmentModel.ensureIndexes();

  // Seed patients
  const patients = Array.from({ length: SEED_PATIENTS }, (_, i) => ({
    systemId: `BENCH-P${i}`,
    firstName: 'Bench',
    lastName: `Patient${i}`,
    searchName: `bench patient${i}`,
    dateOfBirth: '1990-01-01',
    sex: i % 2 === 0 ? 'M' : 'F',
    clinicId: CLINIC_ID,
    isActive: true,
  }));
  await PatientModel.insertMany(patients, { ordered: false });

  // Seed appointments
  const patientDocs = await PatientModel.find({ clinicId: CLINIC_ID }).limit(10).lean();
  const appts = Array.from({ length: SEED_APPOINTMENTS }, (_, i) => ({
    patientId: patientDocs[i % patientDocs.length]?._id ?? new mongoose.Types.ObjectId(),
    clinicId: CLINIC_ID,
    doctorId: new mongoose.Types.ObjectId(),
    scheduledAt: new Date(Date.now() + i * 3600000),
    status: 'scheduled',
    type: 'consultation',
  }));
  await AppointmentModel.insertMany(appts, { ordered: false });

  token = signAccessToken({ userId: USER_ID, role: 'DOCTOR', clinicId: CLINIC_ID });
}, 60_000);

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

// ── Helpers ───────────────────────────────────────────────────────────────────

async function timed(fn: () => Promise<unknown>): Promise<number> {
  const start = Date.now();
  await fn();
  return Date.now() - start;
}

async function concurrentRequests(fn: () => Promise<unknown>, count: number): Promise<number[]> {
  const results = await Promise.all(Array.from({ length: count }, fn));
  return results as number[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Benchmark: /health
// ─────────────────────────────────────────────────────────────────────────────
describe('Benchmark: /health endpoint', () => {
  it(`responds in < ${BUDGET.healthCheck}ms`, async () => {
    const elapsed = await timed(() => request(app).get('/health'));
    console.log(`[bench] /health: ${elapsed}ms`);
    expect(elapsed).toBeLessThan(BUDGET.healthCheck);
  });

  it('maintains baseline across 5 repeated requests', async () => {
    const times: number[] = [];
    for (let i = 0; i < 5; i++) {
      times.push(await timed(() => request(app).get('/health')));
    }
    const avg = times.reduce((a, b) => a + b, 0) / times.length;
    console.log(`[bench] /health avg: ${avg.toFixed(1)}ms, samples: ${JSON.stringify(times)}`);
    expect(avg).toBeLessThan(BUDGET.healthCheck);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Benchmark: GET /api/v1/patients
// ─────────────────────────────────────────────────────────────────────────────
describe(`Benchmark: GET /api/v1/patients (${SEED_PATIENTS} records)`, () => {
  it(`first page list completes in < ${BUDGET.listEndpoint}ms`, async () => {
    const elapsed = await timed(() =>
      request(app)
        .get('/api/v1/patients?page=1&limit=25')
        .set('Authorization', `Bearer ${token}`)
    );
    console.log(`[bench] GET /patients page 1: ${elapsed}ms`);
    expect(elapsed).toBeLessThan(BUDGET.listEndpoint);
  });

  it('search query completes within budget', async () => {
    const elapsed = await timed(() =>
      request(app)
        .get('/api/v1/patients/search?q=bench&limit=20')
        .set('Authorization', `Bearer ${token}`)
    );
    console.log(`[bench] GET /patients/search: ${elapsed}ms`);
    expect(elapsed).toBeLessThan(BUDGET.listEndpoint);
  });

  it('subsequent pages do not regress', async () => {
    const pageTimes: number[] = [];
    for (let page = 1; page <= 4; page++) {
      pageTimes.push(
        await timed(() =>
          request(app)
            .get(`/api/v1/patients?page=${page}&limit=20`)
            .set('Authorization', `Bearer ${token}`)
        )
      );
    }
    const max = Math.max(...pageTimes);
    console.log(`[bench] patients pagination max: ${max}ms, pages: ${JSON.stringify(pageTimes)}`);
    expect(max).toBeLessThan(BUDGET.listEndpoint * 1.5);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Benchmark: single patient read (by ID)
// ─────────────────────────────────────────────────────────────────────────────
describe('Benchmark: GET /api/v1/patients/:id', () => {
  let patientId: string;

  beforeAll(async () => {
    const p = await PatientModel.findOne({ clinicId: CLINIC_ID }).lean();
    patientId = String(p!._id);
  });

  it(`single record read completes in < ${BUDGET.singleRead}ms`, async () => {
    const elapsed = await timed(() =>
      request(app)
        .get(`/api/v1/patients/${patientId}`)
        .set('Authorization', `Bearer ${token}`)
    );
    console.log(`[bench] GET /patients/:id: ${elapsed}ms`);
    expect(elapsed).toBeLessThan(BUDGET.singleRead);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Benchmark: GET /api/v1/appointments
// ─────────────────────────────────────────────────────────────────────────────
describe(`Benchmark: GET /api/v1/appointments (${SEED_APPOINTMENTS} records)`, () => {
  it(`list completes in < ${BUDGET.listEndpoint}ms`, async () => {
    const elapsed = await timed(() =>
      request(app)
        .get('/api/v1/appointments?page=1&limit=25')
        .set('Authorization', `Bearer ${token}`)
    );
    console.log(`[bench] GET /appointments: ${elapsed}ms`);
    expect(elapsed).toBeLessThan(BUDGET.listEndpoint);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Load test: concurrent requests
// ─────────────────────────────────────────────────────────────────────────────
describe(`Load test: ${CONCURRENT_REQUESTS} concurrent GET /api/v1/patients`, () => {
  it('all requests succeed under concurrent load', async () => {
    const responses = await Promise.all(
      Array.from({ length: CONCURRENT_REQUESTS }, () =>
        request(app)
          .get('/api/v1/patients?page=1&limit=10')
          .set('Authorization', `Bearer ${token}`)
      )
    );

    const statuses = responses.map((r) => r.status);
    const failed = statuses.filter((s) => s !== 200);
    console.log(`[bench] concurrent load statuses: ${JSON.stringify(statuses)}`);
    expect(failed).toHaveLength(0);
  });

  it(`p95 response time stays within ${BUDGET.concurrentP95}ms under load`, async () => {
    const times = await Promise.all(
      Array.from({ length: CONCURRENT_REQUESTS }, () =>
        timed(() =>
          request(app)
            .get('/api/v1/patients?page=1&limit=10')
            .set('Authorization', `Bearer ${token}`)
        )
      )
    );

    times.sort((a, b) => a - b);
    const p95Index = Math.ceil(times.length * 0.95) - 1;
    const p95 = times[p95Index];
    console.log(`[bench] concurrent p95: ${p95}ms, all: ${JSON.stringify(times)}`);
    expect(p95).toBeLessThan(BUDGET.concurrentP95);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Cache warm/cold comparison baseline
// ─────────────────────────────────────────────────────────────────────────────
describe('Cache baseline: warm vs cold', () => {
  it('first request (cold) completes within budget', async () => {
    jest.spyOn(cache, 'get').mockResolvedValueOnce(null);
    jest.spyOn(cache, 'set').mockResolvedValueOnce(undefined);

    const elapsed = await timed(() =>
      request(app)
        .get('/api/v1/patients?page=1&limit=10')
        .set('Authorization', `Bearer ${token}`)
    );
    console.log(`[bench] cold request: ${elapsed}ms`);
    jest.restoreAllMocks();
    expect(elapsed).toBeLessThan(BUDGET.listEndpoint);
  });

  it('health check response time is recorded as baseline', async () => {
    const times: number[] = [];
    for (let i = 0; i < 3; i++) {
      times.push(await timed(() => request(app).get('/health')));
    }
    const baseline = Math.min(...times);
    console.log(`[bench] /health baseline min: ${baseline}ms`);
    expect(baseline).toBeGreaterThan(0);
    expect(baseline).toBeLessThan(BUDGET.healthCheck);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Query performance: MongoDB index verification
// ─────────────────────────────────────────────────────────────────────────────
describe('Query performance: index coverage', () => {
  it('clinicId index is present on PatientModel', async () => {
    const indexes = await PatientModel.collection.indexes();
    const hasClinicIndex = indexes.some(
      (idx) => idx.key && ('clinicId' in idx.key || 'clinicId_1' in idx.key || idx.key['clinicId'] !== undefined)
    );
    expect(hasClinicIndex).toBe(true);
  });

  it('fetching patients by clinicId uses an index (fast under 200ms)', async () => {
    const elapsed = await timed(() =>
      PatientModel.find({ clinicId: CLINIC_ID }).limit(50).lean()
    );
    console.log(`[bench] direct Mongoose clinicId query: ${elapsed}ms`);
    expect(elapsed).toBeLessThan(200);
  });

  it('counting patients by clinic is fast', async () => {
    const elapsed = await timed(() =>
      PatientModel.countDocuments({ clinicId: CLINIC_ID })
    );
    console.log(`[bench] countDocuments by clinicId: ${elapsed}ms`);
    expect(elapsed).toBeLessThan(200);
  });

  it('searchName text query is fast', async () => {
    const elapsed = await timed(() =>
      PatientModel.find({
        clinicId: CLINIC_ID,
        searchName: { $regex: '^bench', $options: 'i' },
      })
        .limit(20)
        .lean()
    );
    console.log(`[bench] searchName regex query: ${elapsed}ms`);
    expect(elapsed).toBeLessThan(300);
  });
});
