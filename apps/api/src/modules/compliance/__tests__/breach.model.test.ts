import mongoose from 'mongoose';
import { BreachNotificationModel } from '../breach.model';

const clinicId = new mongoose.Types.ObjectId();

const baseDoc = {
  clinicId,
  breachType: 'unauthorized_access',
  description: 'Employee accessed records without authorization',
  affectedRecords: 12,
  detectedAt: new Date('2026-01-01'),
  notificationDeadline: new Date('2026-03-01'),
};

describe('BreachNotificationModel', () => {
  it('validates a complete breach notification', async () => {
    const breach = new BreachNotificationModel(baseDoc);
    await expect(breach.validate()).resolves.toBeUndefined();
  });

  it('requires description', async () => {
    const breach = new BreachNotificationModel({ ...baseDoc, description: undefined });
    await expect(breach.validate()).rejects.toThrow(/description/);
  });

  it('requires affectedRecords', async () => {
    const breach = new BreachNotificationModel({ ...baseDoc, affectedRecords: undefined });
    await expect(breach.validate()).rejects.toThrow(/affectedRecords/);
  });

  it('defaults status to detected', () => {
    const breach = new BreachNotificationModel(baseDoc);
    expect(breach.status).toBe('detected');
  });

  it('rejects an invalid status value', async () => {
    const breach = new BreachNotificationModel({ ...baseDoc, status: 'ignored' });
    await expect(breach.validate()).rejects.toThrow();
  });
});
