import mongoose from 'mongoose';
import { PatientHealthLogModel } from '../health-log.model';

describe('PatientHealthLog CRUD', () => {
  const patientId = new mongoose.Types.ObjectId();

  it('creates a health log entry', async () => {
    const log = new PatientHealthLogModel({
      patientId,
      metricType: 'weight',
      value: 72.5,
      unit: 'kg',
      loggedAt: new Date(),
    });
    const saved = await log.validate();
    expect(saved).toBeUndefined();
  });

  it('rejects invalid metricType', async () => {
    const log = new PatientHealthLogModel({
      patientId,
      metricType: 'invalid_metric',
      value: 100,
      unit: 'kg',
      loggedAt: new Date(),
    });
    await expect(log.validate()).rejects.toThrow();
  });

  it('requires patientId', async () => {
    const log = new PatientHealthLogModel({
      metricType: 'weight',
      value: 70,
      unit: 'kg',
      loggedAt: new Date(),
    });
    await expect(log.validate()).rejects.toThrow(/patientId/);
  });

  it('requires value', async () => {
    const log = new PatientHealthLogModel({
      patientId,
      metricType: 'heart_rate',
      unit: 'bpm',
      loggedAt: new Date(),
    });
    await expect(log.validate()).rejects.toThrow(/value/);
  });

  it('defaults flagged to false', () => {
    const log = new PatientHealthLogModel({
      patientId,
      metricType: 'blood_glucose',
      value: 5.5,
      unit: 'mmol/L',
      loggedAt: new Date(),
    });
    expect(log.flagged).toBe(false);
  });
});
