import mongoose from 'mongoose';
import { CarePlanModel } from '../care-plan.model';

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
});
