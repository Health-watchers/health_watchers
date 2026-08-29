import mongoose from 'mongoose';
import { PatientHealthLogModel } from '../health-log.model';
import { isAbnormal } from '../health-log.service';

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
    await expect(log.validate()).resolves.toBeUndefined();
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

  it('requires unit', async () => {
    const log = new PatientHealthLogModel({
      patientId,
      metricType: 'weight',
      value: 70,
      loggedAt: new Date(),
    });
    await expect(log.validate()).rejects.toThrow(/unit/);
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

  it('defaults loggedAt to now when not provided', () => {
    const before = new Date();
    const log = new PatientHealthLogModel({
      patientId,
      metricType: 'heart_rate',
      value: 72,
      unit: 'bpm',
    });
    expect(log.loggedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
  });

  it('accepts optional notes under 500 chars', async () => {
    const log = new PatientHealthLogModel({
      patientId,
      metricType: 'exercise_minutes',
      value: 30,
      unit: 'min',
      loggedAt: new Date(),
      notes: 'Morning jog',
    });
    await expect(log.validate()).resolves.toBeUndefined();
  });

  it('rejects notes over 500 chars', async () => {
    const log = new PatientHealthLogModel({
      patientId,
      metricType: 'weight',
      value: 70,
      unit: 'kg',
      loggedAt: new Date(),
      notes: 'x'.repeat(501),
    });
    await expect(log.validate()).rejects.toThrow();
  });

  it('accepts all valid metricType values', async () => {
    const metrics = [
      'weight',
      'blood_pressure',
      'blood_glucose',
      'exercise_minutes',
      'heart_rate',
    ] as const;
    for (const metricType of metrics) {
      const log = new PatientHealthLogModel({
        patientId,
        metricType,
        value: 10,
        unit: 'x',
        loggedAt: new Date(),
      });
      await expect(log.validate()).resolves.toBeUndefined();
    }
  });
});

describe('isAbnormal threshold checks', () => {
  describe('weight', () => {
    it('flags weight above 300 kg', () => expect(isAbnormal('weight', 301)).toBe(true));
    it('does not flag weight at 300 kg', () => expect(isAbnormal('weight', 300)).toBe(false));
    it('does not flag normal weight', () => expect(isAbnormal('weight', 75)).toBe(false));
  });

  describe('blood_pressure', () => {
    it('flags systolic above 180', () => expect(isAbnormal('blood_pressure', 181)).toBe(true));
    it('does not flag normal BP', () => expect(isAbnormal('blood_pressure', 120)).toBe(false));
  });

  describe('blood_glucose', () => {
    it('flags glucose above 11.1', () => expect(isAbnormal('blood_glucose', 12)).toBe(true));
    it('flags glucose below 3.9', () => expect(isAbnormal('blood_glucose', 3)).toBe(true));
    it('does not flag normal glucose', () => expect(isAbnormal('blood_glucose', 5.5)).toBe(false));
  });

  describe('exercise_minutes', () => {
    it('flags exercise above 300 min', () =>
      expect(isAbnormal('exercise_minutes', 301)).toBe(true));
    it('does not flag 60 min', () => expect(isAbnormal('exercise_minutes', 60)).toBe(false));
  });

  describe('heart_rate', () => {
    it('flags heart rate above 130 bpm', () => expect(isAbnormal('heart_rate', 131)).toBe(true));
    it('flags heart rate below 40 bpm', () => expect(isAbnormal('heart_rate', 39)).toBe(true));
    it('does not flag normal heart rate', () => expect(isAbnormal('heart_rate', 72)).toBe(false));
  });
});
