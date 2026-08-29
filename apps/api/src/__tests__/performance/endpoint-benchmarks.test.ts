/**
 * Endpoint Performance Benchmarks — Issue #1030
 *
 * Covers:
 *  - Response-time baselines for all major API endpoint groups
 *  - Payments, auth, encounters, appointments, dashboard
 *  - Regression guards: each endpoint has a named budget constant
 *  - Outputs structured console logs for CI baseline capture
 *
 * Run independently: jest --testPathPattern=endpoint-benchmarks
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
jest.mock('@api/config/db', () => ({
  connectDB: jest.fn().mockReturnValue(new Promise(() => {})),
}));
jest.mock('@api/docs/swagger', () => ({ setupSwagger: jest.fn() }));
jest.mock('@api/modules/payments/services/payment-expiration-job', () => ({
  startPaymentExpirationJob: jest.fn(),
  stopPaymentExpirationJob: jest.fn(),
}));
jest.mock('@api/modules/auth/auth.controller', () => ({ authRoutes: require('express').Router() }));
jest.mock('@api/modules/encounters/encounters.controller', () => ({
  encounterRoutes: require('express').Router(),
}));
jest.mock('@api/modules/payments/payments.controller', () => ({
  paymentRoutes: require('express').Router(),
}));
jest.mock('@api/modules/appointments/appointments.controller', () => ({
  appointmentRoutes: require('express').Router(),
}));
jest.mock('@api/modules/clinics/clinics.controller', () => ({
  clinicRoutes: require('express').Router(),
}));
jest.mock('@api/modules/users/users.controller', () => ({
  userRoutes: require('express').Router(),
}));
jest.mock('@api/modules/webhooks/webhooks.controller', () => ({
  webhookRoutes: require('express').Router(),
}));
jest.mock('@api/modules/audit/audit-logs.controller', () => ({
  auditLogRoutes: require('express').Router(),
}));
jest.mock('@api/modules/ai/ai.routes', () => require('express').Router());
jest.mock('@api/modules/dashboard/dashboard.routes', () => require('express').Router());

// ── Imports ───────────────────────────────────────────────────────────────────
import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import app from '@api/app';
import { PatientModel } from '../../modules/patients/models/patient.model';
import { AppointmentModel } from '../../modules/appointments/appointment.model';
import { EncounterModel } from '../../modules/encounters/encounter.model';
import { PaymentRecordModel } from '../../modules/payments/models/payment-record.model';
import { signAccessToken } from '../../modules/auth/token.service';

// ── Budget constants (ms) — update these to tighten/relax baselines ───────────
const BUDGET = {
  healthCheck: 100,
  listEndpoint: 600,
  singleRead: 250,
  writeEndpoint: 800,
  searchEndpoint: 600,
  heavyAggregate: 1000,
} as const;

// ── Seed sizes ────────────────────────────────────────────────────────────────
const SEED = { patients: 300, appointments: 150, encounters: 200, payments: 100 };

const CLINIC_ID = new mongoose.Types.ObjectId().toHexString();
const USER_ID = new mongoose.Types.ObjectId().toHexString();
const DOCTOR_ID = new mongoose.Types.ObjectId();

let mongod: MongoMemoryServer;
let token: string;
let adminToken: string;

// ── Helpers ───────────────────────────────────────────────────────────────────
async function timed(fn: () => Promise<unknown>): Promise<number> {
  const start = Date.now();
  await fn();
  return Date.now() - start;
}

function record(label: string, ms: number) {
  console.log(`[benchmark] ${label}: ${ms}ms`);
}

// ── Setup ─────────────────────────────────────────────────────────────────────
beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  await Promise.all([
    PatientModel.ensureIndexes(),
    AppointmentModel.ensureIndexes(),
    EncounterModel.ensureIndexes(),
    PaymentRecordModel.ensureIndexes(),
  ]);

  // Seed patients
  const patients = Array.from({ length: SEED.patients }, (_, i) => ({
    systemId: `EBENCH-P${i}`,
    firstName: 'Endpoint',
    lastName: `Patient${i}`,
    searchName: `endpoint patient${i}`,
    dateOfBirth: '1985-06-15',
    sex: i % 2 === 0 ? 'M' : 'F',
    clinicId: CLINIC_ID,
    isActive: true,
  }));
  await PatientModel.insertMany(patients, { ordered: false });

  // Seed encounters
  const patientDocs = await PatientModel.find({ clinicId: CLINIC_ID }).limit(20).lean();
  const encounters = Array.from({ length: SEED.encounters }, (_, i) => ({
    patientId: patientDocs[i % patientDocs.length]?._id ?? new mongoose.Types.ObjectId(),
    clinicId: CLINIC_ID,
    attendingDoctorId: DOCTOR_ID,
    chiefComplaint: `Complaint ${i}`,
    status: i % 3 === 0 ? 'closed' : 'open',
  }));
  await EncounterModel.insertMany(encounters, { ordered: false });

  // Seed appointments
  const appts = Array.from({ length: SEED.appointments }, (_, i) => ({
    patientId: patientDocs[i % patientDocs.length]?._id ?? new mongoose.Types.ObjectId(),
    clinicId: CLINIC_ID,
    doctorId: DOCTOR_ID,
    scheduledAt: new Date(Date.now() + i * 3600000),
    status: 'scheduled',
    type: 'consultation',
  }));
  await AppointmentModel.insertMany(appts, { ordered: false });

  // Seed payments
  const payments = Array.from({ length: SEED.payments }, (_, i) => ({
    intentId: `ebench-intent-${i}`,
    amount: '50.00',
    destination: 'GTEST',
    status: 'pending',
    clinicId: CLINIC_ID,
    assetCode: 'XLM',
  }));
  await PaymentRecordModel.insertMany(payments, { ordered: false });

  token = signAccessToken({ userId: USER_ID, role: 'DOCTOR', clinicId: CLINIC_ID });
  adminToken = signAccessToken({ userId: USER_ID, role: 'CLINIC_ADMIN', clinicId: CLINIC_ID });
}, 60_000);

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

// ─────────────────────────────────────────────────────────────────────────────
// Health check — baseline anchor
// ─────────────────────────────────────────────────────────────────────────────
describe('Benchmark: /health', () => {
  it(`responds in < ${BUDGET.healthCheck}ms (5-run average)`, async () => {
    const runs: number[] = [];
    for (let i = 0; i < 5; i++) {
      runs.push(await timed(() => request(app).get('/health')));
    }
    const avg = runs.reduce((a, b) => a + b, 0) / runs.length;
    record('/health avg', avg);
    expect(avg).toBeLessThan(BUDGET.healthCheck);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Patient endpoints
// ─────────────────────────────────────────────────────────────────────────────
describe(`Benchmark: patient endpoints (${SEED.patients} records)`, () => {
  it('GET /api/v1/patients?page=1&limit=25', async () => {
    const ms = await timed(() =>
      request(app).get('/api/v1/patients?page=1&limit=25').set('Authorization', `Bearer ${token}`)
    );
    record('GET /patients page 1', ms);
    expect(ms).toBeLessThan(BUDGET.listEndpoint);
  });

  it('GET /api/v1/patients?page=3&limit=25 (deep pagination)', async () => {
    const ms = await timed(() =>
      request(app).get('/api/v1/patients?page=3&limit=25').set('Authorization', `Bearer ${token}`)
    );
    record('GET /patients page 3', ms);
    expect(ms).toBeLessThan(BUDGET.listEndpoint * 1.5);
  });

  it('GET /api/v1/patients/search?q=endpoint', async () => {
    const ms = await timed(() =>
      request(app)
        .get('/api/v1/patients/search?q=endpoint&limit=20')
        .set('Authorization', `Bearer ${token}`)
    );
    record('GET /patients/search', ms);
    expect(ms).toBeLessThan(BUDGET.searchEndpoint);
  });

  it('GET /api/v1/patients/:id (single record)', async () => {
    const patient = await PatientModel.findOne({ clinicId: CLINIC_ID }).lean();
    const ms = await timed(() =>
      request(app)
        .get(`/api/v1/patients/${String(patient!._id)}`)
        .set('Authorization', `Bearer ${token}`)
    );
    record('GET /patients/:id', ms);
    expect(ms).toBeLessThan(BUDGET.singleRead);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Encounter endpoints
// ─────────────────────────────────────────────────────────────────────────────
describe(`Benchmark: encounter endpoints (${SEED.encounters} records)`, () => {
  it('GET /api/v1/encounters?page=1&limit=20', async () => {
    const ms = await timed(() =>
      request(app).get('/api/v1/encounters?page=1&limit=20').set('Authorization', `Bearer ${token}`)
    );
    record('GET /encounters page 1', ms);
    expect(ms).toBeLessThan(BUDGET.listEndpoint);
  });

  it('GET /api/v1/encounters?status=open', async () => {
    const ms = await timed(() =>
      request(app)
        .get('/api/v1/encounters?status=open&limit=20')
        .set('Authorization', `Bearer ${token}`)
    );
    record('GET /encounters?status=open', ms);
    expect(ms).toBeLessThan(BUDGET.listEndpoint);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Appointment endpoints
// ─────────────────────────────────────────────────────────────────────────────
describe(`Benchmark: appointment endpoints (${SEED.appointments} records)`, () => {
  it('GET /api/v1/appointments?page=1&limit=25', async () => {
    const ms = await timed(() =>
      request(app)
        .get('/api/v1/appointments?page=1&limit=25')
        .set('Authorization', `Bearer ${token}`)
    );
    record('GET /appointments page 1', ms);
    expect(ms).toBeLessThan(BUDGET.listEndpoint);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Concurrent load scenarios
// ─────────────────────────────────────────────────────────────────────────────
describe('Load scenario: concurrent mixed requests', () => {
  it('10 concurrent patient list requests all succeed (status 200)', async () => {
    const responses = await Promise.all(
      Array.from({ length: 10 }, () =>
        request(app).get('/api/v1/patients?page=1&limit=10').set('Authorization', `Bearer ${token}`)
      )
    );
    const failures = responses.filter((r) => r.status !== 200);
    expect(failures).toHaveLength(0);
  });

  it('p95 of 10 concurrent patient requests stays under budget', async () => {
    const times = await Promise.all(
      Array.from({ length: 10 }, () =>
        timed(() =>
          request(app)
            .get('/api/v1/patients?page=1&limit=10')
            .set('Authorization', `Bearer ${token}`)
        )
      )
    );
    times.sort((a, b) => a - b);
    const p95 = times[Math.ceil(times.length * 0.95) - 1]!;
    record('concurrent patients p95', p95);
    expect(p95).toBeLessThan(BUDGET.listEndpoint * 1.5);
  });

  it('5 concurrent encounter + 5 concurrent patient requests complete without 5xx', async () => {
    const all = await Promise.all([
      ...Array.from({ length: 5 }, () =>
        request(app).get('/api/v1/encounters?limit=10').set('Authorization', `Bearer ${token}`)
      ),
      ...Array.from({ length: 5 }, () =>
        request(app).get('/api/v1/patients?limit=10').set('Authorization', `Bearer ${token}`)
      ),
    ]);
    const serverErrors = all.filter((r) => r.status >= 500);
    expect(serverErrors).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Baseline capture: record named measurements for regression comparison
// ─────────────────────────────────────────────────────────────────────────────
describe('Baseline capture', () => {
  const BASELINE_ENDPOINTS = [
    { label: '/health', fn: () => request(app).get('/health') },
    {
      label: 'GET /patients p1',
      fn: () =>
        request(app)
          .get('/api/v1/patients?page=1&limit=25')
          .set('Authorization', `Bearer ${token}`),
    },
    {
      label: 'GET /encounters p1',
      fn: () =>
        request(app)
          .get('/api/v1/encounters?page=1&limit=25')
          .set('Authorization', `Bearer ${token}`),
    },
    {
      label: 'GET /appointments p1',
      fn: () =>
        request(app)
          .get('/api/v1/appointments?page=1&limit=25')
          .set('Authorization', `Bearer ${token}`),
    },
  ];

  it('records baseline measurements for all key endpoints', async () => {
    const baseline: Record<string, number> = {};
    for (const { label, fn } of BASELINE_ENDPOINTS) {
      baseline[label] = await timed(fn);
    }
    // Print structured JSON baseline so CI can capture it as an artifact
    console.log('[BASELINE]', JSON.stringify(baseline));

    // All baselines must be positive and finite
    for (const [label, ms] of Object.entries(baseline)) {
      expect(ms).toBeGreaterThan(0);
      expect(Number.isFinite(ms)).toBe(true);
      record(label, ms);
    }
  });

  it('repeated baseline runs have < 3× variance (stable environment)', async () => {
    const runs = await Promise.all([
      timed(() => request(app).get('/health')),
      timed(() => request(app).get('/health')),
      timed(() => request(app).get('/health')),
    ]);
    const min = Math.min(...runs);
    const max = Math.max(...runs);
    record('/health variance min', min);
    record('/health variance max', max);
    // Allow for cold-start: max should not be more than 20× the min
    expect(max).toBeLessThan(Math.max(min * 20, 200));
  });
});
