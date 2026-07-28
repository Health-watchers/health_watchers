import mongoose from 'mongoose';
import { ReferralModel } from '../referral.model';

const baseDoc = {
  fromClinicId: new mongoose.Types.ObjectId(),
  toClinicId: new mongoose.Types.ObjectId(),
  patientId: new mongoose.Types.ObjectId(),
  referredBy: new mongoose.Types.ObjectId(),
  reason: 'Suspected cardiac condition',
  urgency: 'urgent',
};

describe('ReferralModel', () => {
  it('validates a minimal valid referral', async () => {
    const referral = new ReferralModel(baseDoc);
    await expect(referral.validate()).resolves.toBeUndefined();
  });

  it('requires reason', async () => {
    const referral = new ReferralModel({ ...baseDoc, reason: undefined });
    await expect(referral.validate()).rejects.toThrow(/reason/);
  });

  it('rejects an invalid urgency value', async () => {
    const referral = new ReferralModel({ ...baseDoc, urgency: 'whenever' });
    await expect(referral.validate()).rejects.toThrow();
  });

  it('defaults status to pending and sharedData flags to false', () => {
    const referral = new ReferralModel(baseDoc);
    expect(referral.status).toBe('pending');
    expect(referral.sharedData.demographics).toBe(false);
    expect(referral.sharedData.labResults).toBe(false);
  });

  it('defaults outcome to pending', () => {
    const referral = new ReferralModel(baseDoc);
    expect(referral.outcome).toBe('pending');
  });
});
