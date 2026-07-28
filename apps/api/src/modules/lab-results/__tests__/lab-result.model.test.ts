import mongoose from 'mongoose';
import { LabResultModel } from '../lab-result.model';

const baseDoc = {
  patientId: new mongoose.Types.ObjectId(),
  clinicId: new mongoose.Types.ObjectId(),
  orderedBy: new mongoose.Types.ObjectId(),
  testName: 'Basic Metabolic Panel',
};

describe('LabResultModel', () => {
  it('validates a minimal valid lab result', async () => {
    const lab = new LabResultModel(baseDoc);
    await expect(lab.validate()).resolves.toBeUndefined();
  });

  it('requires testName', async () => {
    const lab = new LabResultModel({ ...baseDoc, testName: undefined });
    await expect(lab.validate()).rejects.toThrow(/testName/);
  });

  it('defaults status to ordered and isCritical to false', () => {
    const lab = new LabResultModel(baseDoc);
    expect(lab.status).toBe('ordered');
    expect(lab.isCritical).toBe(false);
  });

  it('rejects an invalid status', async () => {
    const lab = new LabResultModel({ ...baseDoc, status: 'archived' });
    await expect(lab.validate()).rejects.toThrow();
  });

  it('stores structured result entries with an optional flag', async () => {
    const lab = new LabResultModel({
      ...baseDoc,
      results: [{ parameter: 'Potassium', value: '7.0', unit: 'mmol/L', referenceRange: '3.5-5.0', flag: 'HH' }],
    });
    await expect(lab.validate()).resolves.toBeUndefined();
    expect(lab.results?.[0].flag).toBe('HH');
  });

  it('rejects a result entry with an invalid flag', async () => {
    const lab = new LabResultModel({
      ...baseDoc,
      results: [{ parameter: 'Glucose', value: '90', unit: 'mg/dL', referenceRange: '70-100', flag: 'X' }],
    });
    await expect(lab.validate()).rejects.toThrow();
  });
});
