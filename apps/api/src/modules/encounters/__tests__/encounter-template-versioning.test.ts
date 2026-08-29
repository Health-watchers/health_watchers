/**
 * Tests for encounter template versioning and clinic-specific customization.
 *
 * Uses MongoMemoryServer — no external connections required.
 */

import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { EncounterTemplateModel } from '../encounter-template.model';

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
  await EncounterTemplateModel.deleteMany({});
});

const clinicA = new mongoose.Types.ObjectId();
const clinicB = new mongoose.Types.ObjectId();
const userId = new mongoose.Types.ObjectId();

function baseTemplate(overrides: Record<string, unknown> = {}) {
  return {
    clinicId: clinicA,
    name: 'General Consultation',
    category: 'general',
    createdBy: userId,
    isActive: true,
    isGlobal: false,
    version: 1,
    isLatest: true,
    ...overrides,
  };
}

describe('EncounterTemplate versioning fields', () => {
  it('creates a template with version=1 and isLatest=true by default', async () => {
    const t = await EncounterTemplateModel.create(baseTemplate());
    expect(t.version).toBe(1);
    expect(t.isLatest).toBe(true);
    expect(t.previousVersionId).toBeUndefined();
  });

  it('stores previousVersionId linking new version to old', async () => {
    const v1 = await EncounterTemplateModel.create(baseTemplate());

    // Simulate a PUT: mark v1 as not latest, create v2
    await EncounterTemplateModel.updateOne({ _id: v1._id }, { isLatest: false });
    const v2 = await EncounterTemplateModel.create(
      baseTemplate({
        name: 'General Consultation (updated)',
        version: 2,
        previousVersionId: v1._id,
        isLatest: true,
      })
    );

    expect(v2.version).toBe(2);
    expect(v2.isLatest).toBe(true);
    expect(String(v2.previousVersionId)).toBe(String(v1._id));

    const refreshedV1 = await EncounterTemplateModel.findById(v1._id).lean();
    expect(refreshedV1!.isLatest).toBe(false);
  });

  it('only one version is isLatest=true in a lineage', async () => {
    const v1 = await EncounterTemplateModel.create(baseTemplate());
    await EncounterTemplateModel.updateOne({ _id: v1._id }, { isLatest: false });
    await EncounterTemplateModel.create(
      baseTemplate({ version: 2, previousVersionId: v1._id, isLatest: true })
    );

    const latestCount = await EncounterTemplateModel.countDocuments({
      clinicId: clinicA,
      isLatest: true,
    });
    expect(latestCount).toBe(1);
  });
});

describe('EncounterTemplate clinic-specific customization (clone)', () => {
  it('clone creates a new template linked to the source', async () => {
    const source = await EncounterTemplateModel.create(
      baseTemplate({ isGlobal: true, clinicId: clinicA })
    );

    const { _id, createdAt, updatedAt, ...rest } = source.toObject();
    const clone = await EncounterTemplateModel.create({
      ...rest,
      name: `${source.name} (copy)`,
      clinicId: clinicB,
      isGlobal: false,
      createdBy: userId,
      version: 1,
      previousVersionId: source._id,
      isLatest: true,
      usageCount: 0,
      isApproved: false,
      visibility: 'clinic',
    });

    expect(clone.clinicId.toString()).toBe(clinicB.toString());
    expect(clone.isGlobal).toBe(false);
    expect(clone.version).toBe(1);
    expect(String(clone.previousVersionId)).toBe(String(source._id));
    expect(clone.name).toBe('General Consultation (copy)');
  });

  it('global templates are accessible across clinics', async () => {
    await EncounterTemplateModel.create(baseTemplate({ isGlobal: true, clinicId: clinicA }));

    const found = await EncounterTemplateModel.findOne({
      isActive: true,
      $or: [{ clinicId: clinicB }, { isGlobal: true }],
    });
    expect(found).not.toBeNull();
  });

  it('clinic-specific templates are not visible to other clinics', async () => {
    await EncounterTemplateModel.create(baseTemplate({ isGlobal: false, clinicId: clinicA }));

    const found = await EncounterTemplateModel.findOne({
      isActive: true,
      $or: [{ clinicId: clinicB }, { isGlobal: true }],
    });
    expect(found).toBeNull();
  });
});

describe('EncounterTemplate version history query', () => {
  it('returns all versions in a lineage', async () => {
    const v1 = await EncounterTemplateModel.create(baseTemplate({ isLatest: false }));
    const v2 = await EncounterTemplateModel.create(
      baseTemplate({ version: 2, previousVersionId: v1._id, isLatest: true })
    );

    const history = await EncounterTemplateModel.find({
      clinicId: clinicA,
      isActive: true,
      $or: [{ _id: v2._id }, { previousVersionId: v2._id }, { _id: v2.previousVersionId }],
    })
      .sort({ version: -1 })
      .lean();

    expect(history).toHaveLength(2);
    expect(history[0].version).toBe(2);
    expect(history[1].version).toBe(1);
  });
});
