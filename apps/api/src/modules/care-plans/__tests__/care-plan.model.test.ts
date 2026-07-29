import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { CarePlanModel } from '../care-plan.model';

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
  await CarePlanModel.deleteMany({});
});

const patientId = new mongoose.Types.ObjectId();
const clinicId = new mongoose.Types.ObjectId();
const createdBy = new mongoose.Types.ObjectId();

const baseDoc = {
  patientId,
  clinicId,
  condition: 'Type 2 Diabetes',
  reviewDate: new Date('2026-01-01'),
  createdBy,
};

describe('CarePlanModel', () => {
  it('validates a minimal valid care plan', async () => {
    const plan = new CarePlanModel(baseDoc);
    await expect(plan.validate()).resolves.toBeUndefined();
  });

  it('requires condition', async () => {
    const plan = new CarePlanModel({ ...baseDoc, condition: undefined });
    await expect(plan.validate()).rejects.toThrow(/condition/);
  });

  it('requires reviewDate', async () => {
    const plan = new CarePlanModel({ ...baseDoc, reviewDate: undefined });
    await expect(plan.validate()).rejects.toThrow(/reviewDate/);
  });

  it('defaults status to active and aiGenerated to false', () => {
    const plan = new CarePlanModel(baseDoc);
    expect(plan.status).toBe('active');
    expect(plan.aiGenerated).toBe(false);
  });

  it('rejects an invalid status enum value', async () => {
    const plan = new CarePlanModel({ ...baseDoc, status: 'archived' });
    await expect(plan.validate()).rejects.toThrow();
  });

  it('stores goals and interventions as embedded arrays', async () => {
    const plan = new CarePlanModel({
      ...baseDoc,
      goals: [{ description: 'Lower A1C to 7%', status: 'active' }],
      interventions: [{ type: 'medication', description: 'Start metformin' }],
    });
    await expect(plan.validate()).resolves.toBeUndefined();
    expect(plan.goals).toHaveLength(1);
    expect(plan.interventions[0].type).toBe('medication');
  });

  it('rejects an intervention with an invalid type', async () => {
    const plan = new CarePlanModel({
      ...baseDoc,
      interventions: [{ type: 'surgery', description: 'invalid type' }],
    });
    await expect(plan.validate()).rejects.toThrow();
  });

  describe('XSS sanitization', () => {
    it('strips <script> tags from condition, goal and intervention descriptions on save', async () => {
      const plan = await CarePlanModel.create({
        ...baseDoc,
        condition: '<script>alert(1)</script>Type 2 Diabetes',
        goals: [{ description: '<img src=x onerror="evil()">Lower A1C to 7%', status: 'active' }],
        interventions: [
          { type: 'medication', description: '<script>evil()</script>Start metformin' },
        ],
      });

      expect(plan.condition).not.toContain('<script>');
      expect(plan.condition).toContain('Type 2 Diabetes');
      expect(plan.goals[0].description).toBe('Lower A1C to 7%');
      expect(plan.interventions[0].description).not.toContain('<script>');
      expect(plan.interventions[0].description).toContain('Start metformin');
    });

    it('strips <script> tags from condition via findOneAndUpdate ($set)', async () => {
      const created = await CarePlanModel.create(baseDoc);

      const updated = await CarePlanModel.findOneAndUpdate(
        { _id: created._id },
        { $set: { condition: '<script>alert(1)</script>Hypertension' } },
        { new: true }
      );

      expect(updated?.condition).not.toContain('<script>');
      expect(updated?.condition).toContain('Hypertension');
    });

    it('strips <script> tags from reviewHistory notes pushed via POST /:id/review', async () => {
      const created = await CarePlanModel.create(baseDoc);

      const updated = await CarePlanModel.findOneAndUpdate(
        { _id: created._id },
        {
          $push: {
            reviewHistory: {
              reviewedBy: createdBy,
              reviewedAt: new Date(),
              notes: '<script>alert(1)</script>reviewed, on track',
            },
          },
        },
        { new: true }
      );

      expect(updated?.reviewHistory[0].notes).not.toContain('<script>');
      expect(updated?.reviewHistory[0].notes).toContain('reviewed, on track');
    });
  });
});
