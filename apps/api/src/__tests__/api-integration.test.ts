/**
 * API integration tests — Issue #905
 *
 * Covers:
 *  - Test fixtures: in-memory MongoDB + JWT factory
 *  - CRUD operations: POST / GET / PUT / DELETE on /api/v1/patients
 *  - Error scenarios: 400 validation, 401 unauthenticated, 403 forbidden, 404 not found
 *  - Permissions: RBAC enforcement across roles
 */

// ── Environment stubs ──────────────────────────────────────────────────────────
process.env.MONGO_URI = 'mongodb://localhost:27017/test';
process.env.JWT_ACCESS_TOKEN_SECRET = 'test-access-secret-32-chars-long!!';
process.env.JWT_REFRESH_TOKEN_SECRET = 'test-refresh-secret-32-chars-long!';
process.env.API_PORT = '3001';
process.env.FIELD_ENCRYPTION_KEY = 'abcdefghijklmnopqrstuvwxyz012345';

// ── Module mocks (must be before imports) ─────────────────────────────────────

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
import { signAccessToken } from '../modules/auth/token.service';
import { AppRole } from '../types/express';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const CLINIC_A = new mongoose.Types.ObjectId().toHexString();
const CLINIC_B = new mongoose.Types.ObjectId().toHexString();
const USER_ID = new mongoose.Types.ObjectId().toHexString();

function makeToken(role: AppRole, clinicId: string = CLINIC_A): string {
  return signAccessToken({ userId: USER_ID, role, clinicId });
}

const VALID_PATIENT = {
  firstName: 'Jane',
  lastName: 'Doe',
  dateOfBirth: '1990-06-15',
  sex: 'F',
};

let mongod: MongoMemoryServer;
let doctorToken: string;
let adminToken: string;
let readOnlyToken: string;
let patientToken: string;

// ── Setup / Teardown ──────────────────────────────────────────────────────────

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  await PatientModel.ensureIndexes();

  doctorToken = makeToken('DOCTOR');
  adminToken = makeToken('CLINIC_ADMIN');
  readOnlyToken = makeToken('READ_ONLY');
  patientToken = makeToken('PATIENT');
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

afterEach(async () => {
  await PatientModel.deleteMany({});
});

// ── Helpers ───────────────────────────────────────────────────────────────────

async function createPatientInDB(overrides: Record<string, unknown> = {}) {
  const counter = await PatientModel.countDocuments();
  return PatientModel.create({
    systemId: `SYS-${counter}-${Date.now()}`,
    firstName: 'John',
    lastName: 'Smith',
    searchName: 'john smith',
    dateOfBirth: '1985-03-10',
    sex: 'M',
    clinicId: CLINIC_A,
    isActive: true,
    ...overrides,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/v1/patients — Create
// ─────────────────────────────────────────────────────────────────────────────
describe('POST /api/v1/patients', () => {
  it('201 — DOCTOR creates a patient successfully', async () => {
    const res = await request(app)
      .post('/api/v1/patients')
      .set('Authorization', `Bearer ${doctorToken}`)
      .send(VALID_PATIENT);

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      data: expect.objectContaining({ firstName: 'Jane', lastName: 'Doe' }),
    });
  });

  it('201 — CLINIC_ADMIN creates a patient successfully', async () => {
    const res = await request(app)
      .post('/api/v1/patients')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(VALID_PATIENT);

    expect(res.status).toBe(201);
  });

  it('401 — rejects request without Authorization header', async () => {
    const res = await request(app).post('/api/v1/patients').send(VALID_PATIENT);
    expect(res.status).toBe(401);
  });

  it('403 — READ_ONLY user cannot create a patient', async () => {
    const res = await request(app)
      .post('/api/v1/patients')
      .set('Authorization', `Bearer ${readOnlyToken}`)
      .send(VALID_PATIENT);

    expect(res.status).toBe(403);
  });

  it('400 — missing required fields returns validation error', async () => {
    const res = await request(app)
      .post('/api/v1/patients')
      .set('Authorization', `Bearer ${doctorToken}`)
      .send({ firstName: 'NoLastName' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('ValidationError');
  });

  it('400 — invalid sex enum returns validation error', async () => {
    const res = await request(app)
      .post('/api/v1/patients')
      .set('Authorization', `Bearer ${doctorToken}`)
      .send({ ...VALID_PATIENT, sex: 'X' });

    expect(res.status).toBe(400);
  });

  it('400 — future date of birth is rejected', async () => {
    const future = new Date(Date.now() + 86400000 * 30).toISOString().split('T')[0];
    const res = await request(app)
      .post('/api/v1/patients')
      .set('Authorization', `Bearer ${doctorToken}`)
      .send({ ...VALID_PATIENT, dateOfBirth: future });

    expect(res.status).toBe(400);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/v1/patients — List
// ─────────────────────────────────────────────────────────────────────────────
describe('GET /api/v1/patients', () => {
  it('200 — DOCTOR retrieves patient list', async () => {
    await createPatientInDB();
    const res = await request(app)
      .get('/api/v1/patients')
      .set('Authorization', `Bearer ${doctorToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it('200 — READ_ONLY user can list patients', async () => {
    const res = await request(app)
      .get('/api/v1/patients')
      .set('Authorization', `Bearer ${readOnlyToken}`);

    expect(res.status).toBe(200);
  });

  it('401 — unauthenticated request is rejected', async () => {
    const res = await request(app).get('/api/v1/patients');
    expect(res.status).toBe(401);
  });

  it('clinic isolation — doctor from clinic B cannot see clinic A patients', async () => {
    await createPatientInDB({ clinicId: CLINIC_A });
    const clinicBToken = makeToken('DOCTOR', CLINIC_B);
    const res = await request(app)
      .get('/api/v1/patients')
      .set('Authorization', `Bearer ${clinicBToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(0);
  });

  it('400 — invalid pagination params return validation error', async () => {
    const res = await request(app)
      .get('/api/v1/patients?page=0')
      .set('Authorization', `Bearer ${doctorToken}`);

    expect(res.status).toBe(400);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/v1/patients/:id — Read single
// ─────────────────────────────────────────────────────────────────────────────
describe('GET /api/v1/patients/:id', () => {
  it('200 — returns patient by ID', async () => {
    const patient = await createPatientInDB();
    const res = await request(app)
      .get(`/api/v1/patients/${patient._id}`)
      .set('Authorization', `Bearer ${doctorToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data._id).toBe(String(patient._id));
  });

  it('404 — unknown ID returns not found', async () => {
    const unknownId = new mongoose.Types.ObjectId().toHexString();
    const res = await request(app)
      .get(`/api/v1/patients/${unknownId}`)
      .set('Authorization', `Bearer ${doctorToken}`);

    expect(res.status).toBe(404);
  });

  it('400 — malformed ObjectId returns error', async () => {
    const res = await request(app)
      .get('/api/v1/patients/not-an-objectid')
      .set('Authorization', `Bearer ${doctorToken}`);

    expect([400, 404]).toContain(res.status);
  });

  it('403 — clinic B doctor cannot access clinic A patient', async () => {
    const patient = await createPatientInDB({ clinicId: CLINIC_A });
    const clinicBToken = makeToken('DOCTOR', CLINIC_B);
    const res = await request(app)
      .get(`/api/v1/patients/${patient._id}`)
      .set('Authorization', `Bearer ${clinicBToken}`);

    expect([403, 404]).toContain(res.status);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// PUT /api/v1/patients/:id — Update
// ─────────────────────────────────────────────────────────────────────────────
describe('PUT /api/v1/patients/:id', () => {
  it('200 — DOCTOR updates a patient', async () => {
    const patient = await createPatientInDB();
    const res = await request(app)
      .put(`/api/v1/patients/${patient._id}`)
      .set('Authorization', `Bearer ${doctorToken}`)
      .send({ firstName: 'Updated' });

    expect(res.status).toBe(200);
    expect(res.body.data.firstName).toBe('Updated');
  });

  it('400 — empty update body returns validation error', async () => {
    const patient = await createPatientInDB();
    const res = await request(app)
      .put(`/api/v1/patients/${patient._id}`)
      .set('Authorization', `Bearer ${doctorToken}`)
      .send({});

    expect(res.status).toBe(400);
  });

  it('403 — READ_ONLY user cannot update a patient', async () => {
    const patient = await createPatientInDB();
    const res = await request(app)
      .put(`/api/v1/patients/${patient._id}`)
      .set('Authorization', `Bearer ${readOnlyToken}`)
      .send({ firstName: 'Hacked' });

    expect(res.status).toBe(403);
  });

  it('404 — updating non-existent patient returns 404', async () => {
    const unknownId = new mongoose.Types.ObjectId().toHexString();
    const res = await request(app)
      .put(`/api/v1/patients/${unknownId}`)
      .set('Authorization', `Bearer ${doctorToken}`)
      .send({ firstName: 'Ghost' });

    expect(res.status).toBe(404);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/v1/patients/:id — Delete (soft)
// ─────────────────────────────────────────────────────────────────────────────
describe('DELETE /api/v1/patients/:id', () => {
  it('200 — CLINIC_ADMIN deletes (deactivates) a patient', async () => {
    const patient = await createPatientInDB();
    const res = await request(app)
      .delete(`/api/v1/patients/${patient._id}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect([200, 204]).toContain(res.status);
  });

  it('403 — DOCTOR cannot delete a patient', async () => {
    const patient = await createPatientInDB();
    const res = await request(app)
      .delete(`/api/v1/patients/${patient._id}`)
      .set('Authorization', `Bearer ${doctorToken}`);

    expect(res.status).toBe(403);
  });

  it('403 — PATIENT role cannot delete a patient record', async () => {
    const patient = await createPatientInDB();
    const res = await request(app)
      .delete(`/api/v1/patients/${patient._id}`)
      .set('Authorization', `Bearer ${patientToken}`);

    expect(res.status).toBe(403);
  });

  it('401 — unauthenticated delete is rejected', async () => {
    const patient = await createPatientInDB();
    const res = await request(app).delete(`/api/v1/patients/${patient._id}`);
    expect(res.status).toBe(401);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Error scenario coverage
// ─────────────────────────────────────────────────────────────────────────────
describe('Error scenarios', () => {
  it('returns JSON error body on 404', async () => {
    const res = await request(app)
      .get(`/api/v1/patients/${new mongoose.Types.ObjectId()}`)
      .set('Authorization', `Bearer ${doctorToken}`);

    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('error');
    expect(res.body).toHaveProperty('message');
  });

  it('returns JSON error body on 400 validation failure', async () => {
    const res = await request(app)
      .post('/api/v1/patients')
      .set('Authorization', `Bearer ${doctorToken}`)
      .send({ firstName: '' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('ValidationError');
    expect(res.body.details).toBeDefined();
  });

  it('returns 401 with structured error when token is missing', async () => {
    const res = await request(app).get('/api/v1/patients');
    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty('error');
    expect(res.body).toHaveProperty('message');
  });

  it('returns 401 with structured error when token is malformed', async () => {
    const res = await request(app)
      .get('/api/v1/patients')
      .set('Authorization', 'Bearer this.is.not.valid');

    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty('error');
  });
});
