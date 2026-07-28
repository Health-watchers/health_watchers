import { Types } from 'mongoose';
import { UsageModel } from './usage.model';
import { SubscriptionModel } from './subscription.model';

type UsageField = 'patientCount' | 'encounterCount' | 'aiRequestCount' | 'doctorCount' | 'userCount';

async function getCurrentPeriod(clinicId: string | Types.ObjectId) {
  const safeClinicId = new Types.ObjectId(String(clinicId));
  const subscription = await SubscriptionModel.findOne({ clinicId: safeClinicId });
  if (!subscription) {
    const now = new Date();
    const end = new Date(now);
    end.setMonth(end.getMonth() + 1);
    return { periodStart: now, periodEnd: end };
  }
  return { periodStart: subscription.currentPeriodStart, periodEnd: subscription.currentPeriodEnd };
}

export async function incrementUsage(clinicId: string | Types.ObjectId, field: UsageField, amount = 1) {
  const safeClinicId = new Types.ObjectId(String(clinicId));
  const { periodStart, periodEnd } = await getCurrentPeriod(safeClinicId);
  await UsageModel.findOneAndUpdate(
    { clinicId: safeClinicId, periodStart, periodEnd },
    { $inc: { [field]: amount } },
    { upsert: true, new: true }
  );
}

export async function getUsage(clinicId: string | Types.ObjectId) {
  const safeClinicId = new Types.ObjectId(String(clinicId));
  const { periodStart, periodEnd } = await getCurrentPeriod(safeClinicId);
  const usage = await UsageModel.findOne({ clinicId: safeClinicId, periodStart, periodEnd });
  return usage ?? { patientCount: 0, encounterCount: 0, aiRequestCount: 0, doctorCount: 0, userCount: 0 };
}

export async function resetUsageForPeriod(clinicId: string | Types.ObjectId, periodStart: Date, periodEnd: Date) {
  const safeClinicId = new Types.ObjectId(String(clinicId));
  await UsageModel.findOneAndUpdate(
    { clinicId: safeClinicId, periodStart, periodEnd },
    { $set: { patientCount: 0, encounterCount: 0, aiRequestCount: 0, doctorCount: 0, userCount: 0 } },
    { upsert: true }
  );
}
