import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { ReferralModel } from '../referral.model';

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
  await ReferralModel.deleteMany({});
});

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

  it('strips <script> tags from reason and notes on save (stored XSS prevention)', async () => {
    const referral = await ReferralModel.create({
      ...baseDoc,
      reason: '<script>alert(1)</script>Suspected cardiac condition',
      notes: '<img src=x onerror="evil()">please expedite',
    });
    expect(referral.reason).not.toContain('<script>');
    expect(referral.reason).toContain('Suspected cardiac condition');
    expect(referral.notes).toBe('please expedite');
  });

  it('strips <script> tags from declinedReason and outcomeNotes on save', async () => {
    const referral = await ReferralModel.create(baseDoc);
    referral.status = 'declined';
    referral.declinedReason = '<script>alert(1)</script>Out of network';
    await referral.save();
    expect(referral.declinedReason).not.toContain('<script>');
    expect(referral.declinedReason).toContain('Out of network');

    referral.status = 'accepted';
    referral.outcome = 'attended';
    referral.outcomeNotes = '<svg onload="evil()">patient seen</svg>';
    await referral.save();
    expect(referral.outcomeNotes).toBe('patient seen');
  });
});
