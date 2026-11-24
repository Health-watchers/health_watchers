/**
 * Integration tests for the consent module.
 *
 * Uses MongoDB Memory Server for a real in-process database (including the
 * real audit log write path) and mounts only the consent router in a
 * minimal Express app.
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

import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { ConsentModel } from '../consent.model';
import { consentRoutes } from '../consent.controller';
import { AuditLogModel } from '../../audit/audit.model';

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/v1', consentRoutes);
  return app;
}

const SECRET = 'test-access-secret-32-chars-long!!';

function makeToken(
  clinicId: string,
  role = 'DOCTOR',
  userId = new mongoose.Types.ObjectId().toString()
) {
  return jwt.sign({ userId, role, clinicId }, SECRET, {
    expiresIn: '15m',
    issuer: 'health-watchers-api',
    audience: 'health-watchers-client',
  });
}

const CLINIC_A = new mongoose.Types.ObjectId().toString();
const CLINIC_B = new mongoose.Types.ObjectId().toString();
const PATIENT_1 = new mongoose.Types.ObjectId().toString();

let mongod: MongoMemoryServer;
let app: express.Express;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  app = buildApp();
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

afterEach(async () => {
  await ConsentModel.deleteMany({});
  await AuditLogModel.deleteMany({});
});

describe('GET /api/v1/templates', () => {
  it('returns the consent templates without requiring a body', async () => {
    const token = makeToken(CLINIC_A);
    const res = await request(app).get('/api/v1/templates').set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.treatment.title).toBe('Consent for Treatment');
  });

  it('returns 401 without authentication', async () => {
    const res = await request(app).get('/api/v1/templates');
    expect(res.status).toBe(401);
  });
});

describe('POST /api/v1/patients/:id/consent', () => {
  const token = makeToken(CLINIC_A, 'DOCTOR');

  it('grants consent, hashes the signature, and writes an audit log entry', async () => {
    const res = await request(app)
      .post(`/api/v1/patients/${PATIENT_1}/consent`)
      .set('Authorization', `Bearer ${token}`)
      .send({ type: 'treatment', signatureData: 'base64-signature' });

    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('granted');
    expect(res.body.data.signatureHash).toMatch(/^[a-f0-9]{64}$/);

    const stored = await ConsentModel.findOne({
      patientId: PATIENT_1,
      clinicId: CLINIC_A,
      type: 'treatment',
    });
    expect(stored?.status).toBe('granted');

    const audit = await AuditLogModel.findOne({ resourceType: 'Consent' });
    expect(audit).not.toBeNull();
  });

  it('re-granting overwrites the previous record for the same patient/clinic/type (upsert)', async () => {
    await request(app)
      .post(`/api/v1/patients/${PATIENT_1}/consent`)
      .set('Authorization', `Bearer ${token}`)
      .send({ type: 'research', signatureData: 'sig-1' });

    const res = await request(app)
      .post(`/api/v1/patients/${PATIENT_1}/consent`)
      .set('Authorization', `Bearer ${token}`)
      .send({ type: 'research', signatureData: 'sig-2' });

    expect(res.status).toBe(201);
    const count = await ConsentModel.countDocuments({ patientId: PATIENT_1, type: 'research' });
    expect(count).toBe(1);
  });

  it('returns 400 for an invalid consent type', async () => {
    const res = await request(app)
      .post(`/api/v1/patients/${PATIENT_1}/consent`)
      .set('Authorization', `Bearer ${token}`)
      .send({ type: 'unknown_type', signatureData: 'sig' });

    expect(res.status).toBe(400);
  });

  it('returns 400 when signatureData is missing', async () => {
    const res = await request(app)
      .post(`/api/v1/patients/${PATIENT_1}/consent`)
      .set('Authorization', `Bearer ${token}`)
      .send({ type: 'treatment' });

    expect(res.status).toBe(400);
  });

  it('returns 401 without authentication', async () => {
    const res = await request(app)
      .post(`/api/v1/patients/${PATIENT_1}/consent`)
      .send({ type: 'treatment', signatureData: 'sig' });

    expect(res.status).toBe(401);
  });

  it('returns 403 for a role without consent-write access', async () => {
    const otherToken = makeToken(CLINIC_A, 'ASSISTANT');
    const res = await request(app)
      .post(`/api/v1/patients/${PATIENT_1}/consent`)
      .set('Authorization', `Bearer ${otherToken}`)
      .send({ type: 'treatment', signatureData: 'sig' });

    expect(res.status).toBe(403);
  });
});

describe('GET /api/v1/patients/:id/consent', () => {
  it("only returns the requesting clinic's consent records", async () => {
    const tokenA = makeToken(CLINIC_A);
    const tokenB = makeToken(CLINIC_B);

    await request(app)
      .post(`/api/v1/patients/${PATIENT_1}/consent`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ type: 'treatment', signatureData: 'sig' });

    const resA = await request(app)
      .get(`/api/v1/patients/${PATIENT_1}/consent`)
      .set('Authorization', `Bearer ${tokenA}`);
    expect(resA.body.data).toHaveLength(1);

    const resB = await request(app)
      .get(`/api/v1/patients/${PATIENT_1}/consent`)
      .set('Authorization', `Bearer ${tokenB}`);
    expect(resB.body.data).toHaveLength(0);
  });
});

describe('DELETE /api/v1/patients/:id/consent/:type', () => {
  const token = makeToken(CLINIC_A, 'CLINIC_ADMIN');

  it('withdraws an existing consent record', async () => {
    await request(app)
      .post(`/api/v1/patients/${PATIENT_1}/consent`)
      .set('Authorization', `Bearer ${token}`)
      .send({ type: 'marketing', signatureData: 'sig' });

    const res = await request(app)
      .delete(`/api/v1/patients/${PATIENT_1}/consent/marketing`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('withdrawn');
  });

  it('returns 404 when withdrawing a consent record that does not exist', async () => {
    const res = await request(app)
      .delete(`/api/v1/patients/${PATIENT_1}/consent/marketing`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
  });
});

describe('POST /api/v1/consent/:id/verify', () => {
  const token = makeToken(CLINIC_A, 'DOCTOR');

  it('reports a valid signature for an untampered consent record', async () => {
    const grantRes = await request(app)
      .post(`/api/v1/patients/${PATIENT_1}/consent`)
      .set('Authorization', `Bearer ${token}`)
      .send({ type: 'ai_analysis', signatureData: 'sig' });

    const consentId = grantRes.body.data._id;
    const res = await request(app)
      .post(`/api/v1/consent/${consentId}/verify`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.isValid).toBe(true);
  });

  it('reports invalid when the signature hash has been tampered with', async () => {
    const grantRes = await request(app)
      .post(`/api/v1/patients/${PATIENT_1}/consent`)
      .set('Authorization', `Bearer ${token}`)
      .send({ type: 'ai_analysis', signatureData: 'sig' });

    await ConsentModel.findByIdAndUpdate(grantRes.body.data._id, {
      signatureHash: 'tampered-hash',
    });

    const res = await request(app)
      .post(`/api/v1/consent/${grantRes.body.data._id}/verify`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.isValid).toBe(false);
  });

  it('returns 404 for a consent record from another clinic', async () => {
    const grantRes = await request(app)
      .post(`/api/v1/patients/${PATIENT_1}/consent`)
      .set('Authorization', `Bearer ${token}`)
      .send({ type: 'ai_analysis', signatureData: 'sig' });

    const otherClinicToken = makeToken(CLINIC_B, 'DOCTOR');
    const res = await request(app)
      .post(`/api/v1/consent/${grantRes.body.data._id}/verify`)
      .set('Authorization', `Bearer ${otherClinicToken}`);

    expect(res.status).toBe(404);
  });
});
