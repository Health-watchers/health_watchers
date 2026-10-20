/**
 * Integration tests for the care-plans module.
 *
 * Uses MongoDB Memory Server for a real in-process database and mounts only
 * the care-plans router in a minimal Express app (mirrors the pattern used
 * by payments.integration.test.ts).
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
import { CarePlanModel } from '../care-plan.model';
import { carePlanRoutes } from '../care-plans.controller';

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/v1/care-plans', carePlanRoutes);
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

function validCarePlanPayload(overrides: Record<string, unknown> = {}) {
  return {
    patientId: new mongoose.Types.ObjectId().toString(),
    condition: 'Type 2 Diabetes',
    reviewDate: '2026-06-01T00:00:00.000Z',
    ...overrides,
  };
}

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
  await CarePlanModel.deleteMany({});
});

describe('POST /api/v1/care-plans', () => {
  const token = makeToken(CLINIC_A, 'DOCTOR');

  it('creates a care plan scoped to the caller clinic', async () => {
    const res = await request(app)
      .post('/api/v1/care-plans')
      .set('Authorization', `Bearer ${token}`)
      .send(validCarePlanPayload());

    expect(res.status).toBe(201);
    expect(res.body.data.condition).toBe('Type 2 Diabetes');
    expect(res.body.data.clinicId).toBe(CLINIC_A);
    expect(res.body.data.status).toBe('active');
  });

  it('returns 400 when the body fails validation', async () => {
    const res = await request(app)
      .post('/api/v1/care-plans')
      .set('Authorization', `Bearer ${token}`)
      .send({ patientId: 'p1' }); // missing condition + reviewDate

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('ValidationError');
  });

  it('returns 401 without authentication', async () => {
    const res = await request(app).post('/api/v1/care-plans').send(validCarePlanPayload());
    expect(res.status).toBe(401);
  });

  it('returns 403 for a role without write access', async () => {
    const readOnlyToken = makeToken(CLINIC_A, 'READ_ONLY');
    const res = await request(app)
      .post('/api/v1/care-plans')
      .set('Authorization', `Bearer ${readOnlyToken}`)
      .send(validCarePlanPayload());

    expect(res.status).toBe(403);
  });
});

describe('GET /api/v1/care-plans/:id', () => {
  const token = makeToken(CLINIC_A, 'DOCTOR');

  it('returns the care plan for a valid id', async () => {
    const created = await CarePlanModel.create({
      ...validCarePlanPayload(),
      clinicId: CLINIC_A,
      createdBy: new mongoose.Types.ObjectId(),
      reviewDate: new Date('2026-06-01'),
    });

    const res = await request(app)
      .get(`/api/v1/care-plans/${created._id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data._id).toBe(created._id.toString());
  });

  it('returns 404 for a care plan belonging to another clinic', async () => {
    const created = await CarePlanModel.create({
      ...validCarePlanPayload(),
      clinicId: CLINIC_B,
      createdBy: new mongoose.Types.ObjectId(),
      reviewDate: new Date('2026-06-01'),
    });

    const res = await request(app)
      .get(`/api/v1/care-plans/${created._id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
  });

  it('returns 400 for a malformed id', async () => {
    const res = await request(app)
      .get('/api/v1/care-plans/not-an-id')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(400);
  });
});

describe('PUT /api/v1/care-plans/:id', () => {
  const token = makeToken(CLINIC_A, 'CLINIC_ADMIN');

  it('updates fields and returns the updated document', async () => {
    const created = await CarePlanModel.create({
      ...validCarePlanPayload(),
      clinicId: CLINIC_A,
      createdBy: new mongoose.Types.ObjectId(),
      reviewDate: new Date('2026-06-01'),
    });

    const res = await request(app)
      .put(`/api/v1/care-plans/${created._id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'completed' });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('completed');
  });

  it('returns 404 when updating a care plan outside the caller clinic', async () => {
    const created = await CarePlanModel.create({
      ...validCarePlanPayload(),
      clinicId: CLINIC_B,
      createdBy: new mongoose.Types.ObjectId(),
      reviewDate: new Date('2026-06-01'),
    });

    const res = await request(app)
      .put(`/api/v1/care-plans/${created._id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'completed' });

    expect(res.status).toBe(404);
  });

  it('returns 400 for an invalid status transition value', async () => {
    const created = await CarePlanModel.create({
      ...validCarePlanPayload(),
      clinicId: CLINIC_A,
      createdBy: new mongoose.Types.ObjectId(),
      reviewDate: new Date('2026-06-01'),
    });

    const res = await request(app)
      .put(`/api/v1/care-plans/${created._id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'archived' });

    expect(res.status).toBe(400);
  });
});

describe('POST /api/v1/care-plans/:id/review', () => {
  const token = makeToken(CLINIC_A, 'DOCTOR');

  it('appends a review entry to the history', async () => {
    const created = await CarePlanModel.create({
      ...validCarePlanPayload(),
      clinicId: CLINIC_A,
      createdBy: new mongoose.Types.ObjectId(),
      reviewDate: new Date('2026-06-01'),
    });

    const res = await request(app)
      .post(`/api/v1/care-plans/${created._id}/review`)
      .set('Authorization', `Bearer ${token}`)
      .send({ notes: 'Patient improving' });

    expect(res.status).toBe(200);
    expect(res.body.data.reviewHistory).toHaveLength(1);
    expect(res.body.data.reviewHistory[0].notes).toBe('Patient improving');
  });

  it('advances reviewDate when nextReviewDate is provided', async () => {
    const created = await CarePlanModel.create({
      ...validCarePlanPayload(),
      clinicId: CLINIC_A,
      createdBy: new mongoose.Types.ObjectId(),
      reviewDate: new Date('2026-06-01'),
    });

    const res = await request(app)
      .post(`/api/v1/care-plans/${created._id}/review`)
      .set('Authorization', `Bearer ${token}`)
      .send({ nextReviewDate: '2026-12-01T00:00:00.000Z' });

    expect(res.status).toBe(200);
    expect(new Date(res.body.data.reviewDate).toISOString()).toBe('2026-12-01T00:00:00.000Z');
  });

  it('returns 404 for a non-existent care plan id', async () => {
    const res = await request(app)
      .post(`/api/v1/care-plans/${new mongoose.Types.ObjectId()}/review`)
      .set('Authorization', `Bearer ${token}`)
      .send({ notes: 'n/a' });

    expect(res.status).toBe(404);
  });
});
