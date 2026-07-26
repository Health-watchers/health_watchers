/**
 * XSS sanitization tests for encounter.model.ts SOAP note pre-hooks.
 * Uses MongoMemoryServer for a real in-process DB — no external connections.
 */

import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { EncounterModel } from '../encounter.model';

let mongod: MongoMemoryServer;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

afterEach(async () => {
  await EncounterModel.deleteMany({});
});

function baseDoc() {
  return {
    patientId: new mongoose.Types.ObjectId(),
    clinicId: new mongoose.Types.ObjectId(),
    attendingDoctorId: new mongoose.Types.ObjectId(),
    chiefComplaint: 'Test complaint',
  };
}

// ─── pre('save') ─────────────────────────────────────────────────────────────

describe('pre(save) — SOAP note XSS sanitization', () => {
  it('strips <script> tags from subjective on save', async () => {
    const doc = await EncounterModel.create({
      ...baseDoc(),
      soapNotes: { subjective: '<script>alert("xss")</script>clean text' },
    });
    expect(doc.soapNotes?.subjective).toBe('clean text');
  });

  it('strips on* event attributes from allowed tags', async () => {
    const doc = await EncounterModel.create({
      ...baseDoc(),
      soapNotes: { subjective: '<p onclick="evil()">text</p>' },
    });
    expect(doc.soapNotes?.subjective).toBe('<p>text</p>');
  });

  it('strips disallowed tags containing javascript: href (inner text preserved)', async () => {
    const doc = await EncounterModel.create({
      ...baseDoc(),
      soapNotes: { subjective: '<a href="javascript:alert(1)">click</a>' },
    });
    // <a> is not in ALLOWED_TAGS — tag stripped, inner text kept
    expect(doc.soapNotes?.subjective).toBe('click');
  });

  it('preserves safe formatting tags', async () => {
    const doc = await EncounterModel.create({
      ...baseDoc(),
      soapNotes: { subjective: '<p><strong>safe</strong></p>' },
    });
    expect(doc.soapNotes?.subjective).toBe('<p><strong>safe</strong></p>');
  });

  it('sanitizes objective, assessment, and plan fields on save', async () => {
    const doc = await EncounterModel.create({
      ...baseDoc(),
      soapNotes: {
        objective: '<script>alert(1)</script>objective',
        assessment: '<img onerror="evil()">assessment',
        plan: '<p>safe plan</p>',
      },
    });
    expect(doc.soapNotes?.objective).toBe('objective');
    expect(doc.soapNotes?.assessment).toBe('assessment');
    expect(doc.soapNotes?.plan).toBe('<p>safe plan</p>');
  });

  it('leaves soapNotes unchanged when no soapNotes are provided', async () => {
    const doc = await EncounterModel.create(baseDoc());
    expect(doc.soapNotes).toBeUndefined();
  });
});

// ─── pre('findOneAndUpdate') ──────────────────────────────────────────────────

describe('pre(findOneAndUpdate) — SOAP note XSS sanitization', () => {
  it('strips <script> from subjective via direct update', async () => {
    const created = await EncounterModel.create(baseDoc());

    const updated = await EncounterModel.findOneAndUpdate(
      { _id: created._id },
      { $set: { soapNotes: { subjective: '<script>alert("xss")</script>clean text' } } },
      { new: true }
    );

    expect(updated?.soapNotes?.subjective).toBe('clean text');
  });

  it('strips on* event attributes via $set.soapNotes', async () => {
    const created = await EncounterModel.create(baseDoc());

    const updated = await EncounterModel.findOneAndUpdate(
      { _id: created._id },
      { $set: { soapNotes: { objective: '<p onclick="evil()">text</p>' } } },
      { new: true }
    );

    expect(updated?.soapNotes?.objective).toBe('<p>text</p>');
  });

  it('strips disallowed tags with javascript: href via $set.soapNotes', async () => {
    const created = await EncounterModel.create(baseDoc());

    const updated = await EncounterModel.findOneAndUpdate(
      { _id: created._id },
      { $set: { soapNotes: { assessment: '<a href="javascript:alert(1)">click</a>' } } },
      { new: true }
    );

    expect(updated?.soapNotes?.assessment).toBe('click');
  });

  it('preserves safe HTML via $set.soapNotes', async () => {
    const created = await EncounterModel.create(baseDoc());

    const updated = await EncounterModel.findOneAndUpdate(
      { _id: created._id },
      { $set: { soapNotes: { plan: '<p><strong>safe</strong></p>' } } },
      { new: true }
    );

    expect(updated?.soapNotes?.plan).toBe('<p><strong>safe</strong></p>');
  });

  it('also sanitizes FREE_TEXT_FIELDS via findOneAndUpdate', async () => {
    const created = await EncounterModel.create(baseDoc());

    const updated = await EncounterModel.findOneAndUpdate(
      { _id: created._id },
      { $set: { chiefComplaint: '<b>headache</b>' } },
      { new: true }
    );

    // sanitizeText strips ALL tags from plain-text fields
    expect(updated?.chiefComplaint).toBe('headache');
  });
});
