import { Types } from 'mongoose';
import { UsageModel } from './usage.model';
import { SubscriptionModel } from './subscription.model';

type UsageField = 'patientCount' | 'encounterCount' | 'aiRequestCount' | 'doctorCount';

async function getCurrentPeriod(clinicId: string | Types.ObjectId) {
  const subscription = await SubscriptionModel.findOne({ clinicId });
  if (!subscription) {
    const now = new Date();
    const end = new Date(now);
    end.setMonth(end.getMonth() + 1);
    return { periodStart: now, periodEnd: end };
  }
  return { periodStart: subscription.currentPeriodStart, periodEnd: subscription.currentPeriodEnd };
}

export async function incrementUsage(clinicId: string | Types.ObjectId, field: UsageField, amount = 1) {
  const { periodStart, periodEnd } = await getCurrentPeriod(clinicId);

  await UsageModel.findOneAndUpdate(
    { clinicId, periodStart, periodEnd },
    { $inc: { [field]: amount } },
    { upsert: true, new: true }
  );
}

export async function getUsage(clinicId: string | Types.ObjectId) {
  const { periodStart, periodEnd } = await getCurrentPeriod(clinicId);

  const usage = await UsageModel.findOne({ clinicId, periodStart, periodEnd });
  return usage ?? { patientCount: 0, encounterCount: 0, aiRequestCount: 0, doctorCount: 0 };
}

export async function resetUsageForPeriod(clinicId: string | Types.ObjectId, periodStart: Date, periodEnd: Date) {
  await UsageModel.findOneAndUpdate(
    { clinicId, periodStart, periodEnd },
    { $set: { patientCount: 0, encounterCount: 0, aiRequestCount: 0, doctorCount: 0 } },
    { upsert: true }
  );
}
