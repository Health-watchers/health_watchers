/**
 * Integration test — no PHI in logs (issue #1498).
 *
 * Seeds patients with unique canary values (names, DOB, phone, national ID), drives the
 * patient workflows end to end — including validation failures, cross-clinic lookups and
 * search — then asserts that no canary reached:
 *   - the application logger (real pino instance with the production redaction rules)
 *   - console output
 *   - the request audit log files written by requestAuditMiddleware
 *   - Sentry (captureException / captureMessage / breadcrumbs, mocked)
 *
 * The patient schema has no dedicated national-ID field, so that canary travels in the
 * free-text address, which is where staff record it today.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';

const AUDIT_LOG_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'phi-audit-'));
process.env.AUDIT_LOG_DIR = AUDIT_LOG_DIR;
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

// Real logger output and Sentry calls are captured instead of mocked away.
jest.mock('@api/utils/logger', () => require('./helpers/log-capture').captureLoggerModule());
jest.mock('@sentry/node', () => require('./helpers/log-capture').captureSentryModule());

jest.mock('@api/lib/email.service', () => {
  const handler = {
    get: (_target: unknown, prop: string | symbol) =>
      typeof prop === 'string' ? jest.fn() : undefined,
  };
  return new Proxy({}, handler);
});

jest.mock('@api/realtime/socket', () => ({
  emitToClinic: jest.fn(),
  emitToUser: jest.fn(),
}));

jest.mock('@api/services/metrics.service', () => ({
  patientsCreatedTotal: { inc: jest.fn() },
}));

import crypto from 'crypto';
import express from 'express';
import request from 'supertest';
import mongoose from 'mongoose';
import { patientRoutes } from '../modules/patients/patients.controller';
import { PatientModel } from '../modules/patients/models/patient.model';
import { requestAuditMiddleware } from '../middlewares/request-audit.middleware';
import { mutationAuditMiddleware } from '../middlewares/mutation-audit.middleware';
import { startTestDb, stopTestDb, TestDb } from './helpers/test-db';
import { createClinicWithAdmin, createPatient, makeAccessToken } from './helpers/factories';
import {
  CapturedLine,
  assertNoCanaries,
  captureConsole,
  capturedLines,
  createCapturingLogger,
  findCanaryLeaks,
} from './helpers/log-capture';

// ── Canary values — unique per run so they can't collide with fixture data ───

const tag = crypto.randomBytes(4).toString('hex');
const digits = () => String(crypto.randomInt(100_000_000, 999_999_999));

const CANARY = {
  firstName: `Canaryfirst${tag}`,
  lastName: `Canarylast${tag}`,
  dateOfBirth: '1937-02-19',
  phone: `+1${digits()}7`,
  nationalId: `NID-${tag}-${digits()}`,
};
const CANARY_B = {
  firstName: `Canarysecond${tag}`,
  lastName: `Canaryother${tag}`,
  dateOfBirth: '1944-11-03',
  phone: `+4${digits()}1`,
  nationalId: `NID-${tag}-${digits()}`,
};

/** Every value that must never appear in output, incl. the phone without its `+`. */
const CANARIES = [CANARY, CANARY_B].flatMap((c) => [
  c.firstName,
  c.lastName,
  c.dateOfBirth,
  c.phone,
  c.phone.slice(1),
  c.nationalId,
]);

function readAuditFiles(): CapturedLine[] {
  return fs
    .readdirSync(AUDIT_LOG_DIR)
    .flatMap((f) => fs.readFileSync(path.join(AUDIT_LOG_DIR, f), 'utf8').split('\n'))
    .filter(Boolean)
    .map((line) => ({ source: 'audit-file' as const, line }));
}

/** requestAuditMiddleware writes on setImmediate after the response finishes. */
const flushAuditWrites = () => new Promise((resolve) => setImmediate(resolve));

describe('PHI never reaches logs, console, audit files or Sentry', () => {
  let testDb: TestDb;
  let app: express.Express;
  let token: string;
  let otherClinicToken: string;
  let clinicId: string;
  let patientId: string;

  beforeAll(async () => {
    captureConsole();
    testDb = await startTestDb();

    app = express();
    app.use(express.json());
    app.use(requestAuditMiddleware);
    app.use(mutationAuditMiddleware);
    app.use('/api/v1/patients', patientRoutes);

    const { clinic, admin } = await createClinicWithAdmin();
    clinicId = clinic._id.toString();
    token = makeAccessToken({ userId: admin._id.toString(), role: 'CLINIC_ADMIN', clinicId });

    const other = await createClinicWithAdmin();
    otherClinicToken = makeAccessToken({
      userId: other.admin._id.toString(),
      role: 'DOCTOR',
      clinicId: other.clinic._id.toString(),
    });

    // Seeded directly through the model layer (encryption + hooks run)
    await createPatient({
      firstName: CANARY_B.firstName,
      lastName: CANARY_B.lastName,
      dateOfBirth: CANARY_B.dateOfBirth,
      contactNumber: CANARY_B.phone,
      clinicId: new mongoose.Types.ObjectId(clinicId),
    });
  });

  afterAll(async () => {
    jest.restoreAllMocks();
    await stopTestDb(testDb);
    fs.rmSync(AUDIT_LOG_DIR, { recursive: true, force: true });
  });

  const auth = () => ({ Authorization: `Bearer ${token}` });

  it('creates a canary patient through the API', async () => {
    const res = await request(app)
      .post('/api/v1/patients')
      .set(auth())
      .send({
        firstName: CANARY.firstName,
        lastName: CANARY.lastName,
        dateOfBirth: CANARY.dateOfBirth,
        sex: 'F',
        contactNumber: CANARY.phone,
        address: `12 Canary Row, national ID ${CANARY.nationalId}`,
      });
    expect(res.status).toBe(201);
    patientId = res.body.data._id ?? res.body.data.id;
  });

  it('rejects an invalid body carrying canary values', async () => {
    const res = await request(app)
      .post('/api/v1/patients')
      .set(auth())
      .send({
        firstName: CANARY.firstName,
        lastName: CANARY.lastName,
        dateOfBirth: CANARY.dateOfBirth,
        sex: 'not-a-sex',
        contactNumber: `${CANARY.phone} ${CANARY.nationalId}`,
      });
    expect(res.status).toBe(400);
  });

  it('lists, searches and reads patients', async () => {
    expect((await request(app).get('/api/v1/patients').set(auth())).status).toBe(200);

    const search = await request(app)
      .get('/api/v1/patients/search')
      .query({ q: CANARY.firstName })
      .set(auth());
    expect(search.status).toBe(200);

    const one = await request(app).get(`/api/v1/patients/${patientId}`).set(auth());
    expect(one.status).toBe(200);
    expect(one.body.data.firstName).toBe(CANARY.firstName);
  });

  it('does not leak PHI when another clinic probes the record', async () => {
    const res = await request(app)
      .put(`/api/v1/patients/${patientId}`)
      .set({ Authorization: `Bearer ${otherClinicToken}` })
      .send({
        firstName: CANARY.firstName,
        lastName: CANARY.lastName,
        dateOfBirth: CANARY.dateOfBirth,
        sex: 'F',
      });
    expect(res.status).toBe(404);
  });

  it('updates the patient with PUT and PATCH', async () => {
    const put = await request(app)
      .put(`/api/v1/patients/${patientId}`)
      .set(auth())
      .send({
        firstName: CANARY.firstName,
        lastName: CANARY.lastName,
        dateOfBirth: CANARY.dateOfBirth,
        sex: 'F',
        contactNumber: CANARY.phone,
        address: `National ID ${CANARY.nationalId}`,
      });
    expect(put.status).toBe(200);

    const patch = await request(app)
      .patch(`/api/v1/patients/${patientId}`)
      .set(auth())
      .send({ contactNumber: CANARY.phone });
    expect(patch.status).toBe(200);

    const invalid = await request(app)
      .patch(`/api/v1/patients/${patientId}`)
      .set(auth())
      .send({ contactNumber: `ID ${CANARY.nationalId}` });
    expect(invalid.status).toBe(400);
  });

  it('soft-deletes the patient', async () => {
    const res = await request(app).delete(`/api/v1/patients/${patientId}`).set(auth());
    expect(res.status).toBe(200);
    expect(await PatientModel.countDocuments({ _id: patientId, isActive: false })).toBe(1);
  });

  it('flags a leak such as logger.info(patient)', async () => {
    // Guards the detector itself: logging a patient document must be caught.
    const sink: CapturedLine[] = [];
    const patient = await PatientModel.findOne({ searchName: /canarysecond/ });
    createCapturingLogger(sink).info(patient!.toObject(), 'patient loaded');

    expect(findCanaryLeaks(CANARIES, sink).length).toBeGreaterThan(0);
    expect(() => assertNoCanaries(CANARIES, sink)).toThrow(/canary ".+" in: .*patient loaded/);
  });

  it('leaves no canary in logger, console, audit file or Sentry output', async () => {
    await flushAuditWrites();
    // Make sure the channels were actually exercised, so a silent pipe can't pass vacuously.
    expect(capturedLines().some((l) => l.source === 'logger')).toBe(true);
    const auditLines = readAuditFiles();
    expect(auditLines.length).toBeGreaterThan(0);

    assertNoCanaries(CANARIES, [...capturedLines(), ...auditLines]);
  });
});
