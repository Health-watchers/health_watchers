/**
 * Tests for:
 *  - generatePatientFriendlySummary (AI service)
 *  - POST /portal/encounters/:id/notes (patient note addition)
 *  - GET  /portal/encounters (encounter list with summaries)
 *
 * Uses MongoMemoryServer — no external connections required.
 */

import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import request from 'supertest';
import express from 'express';

// ── Mocks ─────────────────────────────────────────────────────────────────────

jest.mock('../../ai/ai.service', () => ({
  isAIServiceAvailable: jest.fn(() => false),
  generatePatientFriendlySummary: jest.fn(),
}));

jest.mock('@api/middlewares/auth.middleware', () => ({
  authenticate: (req: any, _res: any, next: any) => {
    req.user = {
      userId: testUserId,
      role: 'PATIENT',
      clinicId: testClinicId,
      patientId: testPatientId,
    };
    next();
  },
  requireRoles: () => (_req: any, _res: any, next: any) => next(),
}));

// Stub out sub-routes that pull in heavy dependencies
jest.mock('../portal-mfa.routes', () => ({ portalMfaRoutes: require('express').Router() }));
jest.mock('../../export/export-request.controller', () => ({ exportRequestRoutes: require('express').Router() }));

import { generatePatientFriendlySummary, isAIServiceAvailable } from '../../ai/ai.service';
import { EncounterModel } from '../../encounters/encounter.model';
import { portalRoutes } from '../portal.controller';

const mockGenerate = generatePatientFriendlySummary as jest.MockedFunction<typeof generatePatientFriendlySummary>;
const mockAIAvailable = isAIServiceAvailable as jest.MockedFunction<typeof isAIServiceAvailable>;

// ── Shared IDs ────────────────────────────────────────────────────────────────

const testPatientId = new mongoose.Types.ObjectId().toString();
const testClinicId  = new mongoose.Types.ObjectId().toString();
const testUserId    = new mongoose.Types.ObjectId().toString();
const doctorId      = new mongoose.Types.ObjectId();

// ── Setup / teardown ──────────────────────────────────────────────────────────

let mongod: MongoMemoryServer;
let app: express.Express;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());

  app = express();
  app.use(express.json());
  app.use('/api/v1/portal', portalRoutes);
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

afterEach(async () => {
  await EncounterModel.deleteMany({});
  jest.clearAllMocks();
});

function baseEncounter(overrides: Record<string, unknown> = {}) {
  return {
    patientId: new mongoose.Types.ObjectId(testPatientId),
    clinicId:  new mongoose.Types.ObjectId(testClinicId),
    attendingDoctorId: doctorId,
    chiefComplaint: 'Headache and fever',
    status: 'closed',
    isActive: true,
    ...overrides,
  };
}

// ── generatePatientFriendlySummary unit tests ─────────────────────────────────

describe('generatePatientFriendlySummary', () => {
  it('returns a patient-friendly string', async () => {
    mockGenerate.mockResolvedValueOnce('You visited for a headache. Rest and take ibuprofen.');

    const result = await generatePatientFriendlySummary({
      chiefComplaint: 'Headache',
      soapNotes: { assessment: 'Viral infection', plan: 'Rest and ibuprofen' },
      diagnosis: [{ code: 'J06.9', description: 'Acute upper respiratory infection' }],
    });

    expect(result).toBe('You visited for a headache. Rest and take ibuprofen.');
    expect(mockGenerate).toHaveBeenCalledTimes(1);
  });

  it('propagates errors from the AI model', async () => {
    mockGenerate.mockRejectedValueOnce(new Error('API quota exceeded'));

    await expect(
      generatePatientFriendlySummary({ chiefComplaint: 'Chest pain' })
    ).rejects.toThrow('API quota exceeded');
  });
});

// ── POST /portal/encounters/:id/notes ─────────────────────────────────────────

describe('POST /api/v1/portal/encounters/:id/notes', () => {
  it('adds a note and returns updated patientNotes', async () => {
    const enc = await EncounterModel.create(baseEncounter());

    const res = await request(app)
      .post(`/api/v1/portal/encounters/${enc._id}/notes`)
      .send({ note: 'Still have mild headache after 3 days.' });

    expect(res.status).toBe(200);
    expect(res.body.data.patientNotes).toHaveLength(1);
    expect(res.body.data.patientNotes[0].note).toBe('Still have mild headache after 3 days.');
  });

  it('appends multiple notes in order', async () => {
    const enc = await EncounterModel.create(baseEncounter());

    await request(app).post(`/api/v1/portal/encounters/${enc._id}/notes`).send({ note: 'First' });
    const res = await request(app).post(`/api/v1/portal/encounters/${enc._id}/notes`).send({ note: 'Second' });

    expect(res.status).toBe(200);
    expect(res.body.data.patientNotes).toHaveLength(2);
    expect(res.body.data.patientNotes[1].note).toBe('Second');
  });

  it('returns 404 for an encounter belonging to a different patient', async () => {
    const enc = await EncounterModel.create(
      baseEncounter({ patientId: new mongoose.Types.ObjectId() })
    );

    const res = await request(app)
      .post(`/api/v1/portal/encounters/${enc._id}/notes`)
      .send({ note: 'Should not work' });

    expect(res.status).toBe(404);
  });

  it('returns 400 when note is empty', async () => {
    const enc = await EncounterModel.create(baseEncounter());
    const res = await request(app)
      .post(`/api/v1/portal/encounters/${enc._id}/notes`)
      .send({ note: '' });
    expect(res.status).toBe(400);
  });

  it('returns 400 when note exceeds 1000 characters', async () => {
    const enc = await EncounterModel.create(baseEncounter());
    const res = await request(app)
      .post(`/api/v1/portal/encounters/${enc._id}/notes`)
      .send({ note: 'x'.repeat(1001) });
    expect(res.status).toBe(400);
  });

  it('returns 404 for a non-existent encounter id', async () => {
    const res = await request(app)
      .post(`/api/v1/portal/encounters/${new mongoose.Types.ObjectId()}/notes`)
      .send({ note: 'Note for missing encounter' });
    expect(res.status).toBe(404);
  });

  it('does not expose soapNotes in the response', async () => {
    const enc = await EncounterModel.create(
      baseEncounter({ soapNotes: { subjective: 'Sensitive clinical notes' } })
    );

    const res = await request(app)
      .post(`/api/v1/portal/encounters/${enc._id}/notes`)
      .send({ note: 'My question' });

    expect(res.status).toBe(200);
    expect(res.body.data).not.toHaveProperty('soapNotes');
  });
});

// ── GET /portal/encounters ────────────────────────────────────────────────────

describe('GET /api/v1/portal/encounters', () => {
  it('returns paginated encounters for the authenticated patient', async () => {
    await EncounterModel.create([
      baseEncounter({ chiefComplaint: 'Headache' }),
      baseEncounter({ chiefComplaint: 'Back pain' }),
    ]);

    const res = await request(app).get('/api/v1/portal/encounters?page=1&limit=10');

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.meta).toMatchObject({ total: 2, page: 1 });
  });

  it('does not return encounters from other patients', async () => {
    await EncounterModel.create([
      baseEncounter({ chiefComplaint: 'My encounter' }),
      baseEncounter({ patientId: new mongoose.Types.ObjectId(), chiefComplaint: 'Other patient' }),
    ]);

    const res = await request(app).get('/api/v1/portal/encounters');

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].chiefComplaint).toBe('My encounter');
  });

  it('does not expose soapNotes in the response', async () => {
    await EncounterModel.create(
      baseEncounter({ soapNotes: { subjective: 'Sensitive clinical notes' } })
    );

    const res = await request(app).get('/api/v1/portal/encounters');

    expect(res.status).toBe(200);
    expect(res.body.data[0]).not.toHaveProperty('soapNotes');
  });

  it('includes patientFriendlySummary when already stored', async () => {
    await EncounterModel.create(
      baseEncounter({ patientFriendlySummary: 'You visited for a headache.' })
    );

    const res = await request(app).get('/api/v1/portal/encounters');

    expect(res.status).toBe(200);
    expect(res.body.data[0].patientFriendlySummary).toBe('You visited for a headache.');
  });

  it('generates and persists summary via AI when not yet present', async () => {
    mockAIAvailable.mockReturnValue(true);
    mockGenerate.mockResolvedValueOnce('AI-generated summary.');

    await EncounterModel.create(baseEncounter());

    const res = await request(app).get('/api/v1/portal/encounters');

    expect(res.status).toBe(200);
    expect(mockGenerate).toHaveBeenCalledTimes(1);
    expect(res.body.data[0].patientFriendlySummary).toBe('AI-generated summary.');

    const stored = await EncounterModel.findOne({ patientId: new mongoose.Types.ObjectId(testPatientId) });
    expect(stored?.patientFriendlySummary).toBe('AI-generated summary.');
  });

  it('returns null summary gracefully when AI is unavailable', async () => {
    mockAIAvailable.mockReturnValue(false);
    await EncounterModel.create(baseEncounter());

    const res = await request(app).get('/api/v1/portal/encounters');

    expect(res.status).toBe(200);
    expect(res.body.data[0].patientFriendlySummary).toBeNull();
    expect(mockGenerate).not.toHaveBeenCalled();
  });

  it('returns 400 when limit exceeds 100', async () => {
    const res = await request(app).get('/api/v1/portal/encounters?limit=200');
    expect(res.status).toBe(400);
  });
});
