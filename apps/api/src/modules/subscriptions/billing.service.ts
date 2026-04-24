import { Types } from 'mongoose';
import { SubscriptionModel } from './subscription.model';
import { ClinicModel } from '../clinics/clinic.model';
import { TIER_PRICES } from './subscription.tiers';
import logger from '@api/utils/logger';

const GRACE_PERIOD_DAYS = 7;

export async function generateBillingInvoice(clinicId: string | Types.ObjectId) {
  const subscription = await SubscriptionModel.findOne({ clinicId });
  if (!subscription || subscription.tier === 'free') return null;

  const clinic = await ClinicModel.findById(clinicId);
  if (!clinic) return null;

  const amount = TIER_PRICES[subscription.tier];
  const dueDate = new Date(subscription.currentPeriodEnd);
  const gracePeriodEnd = new Date(dueDate);
  gracePeriodEnd.setDate(gracePeriodEnd.getDate() + GRACE_PERIOD_DAYS);

  await SubscriptionModel.findByIdAndUpdate(subscription._id, {
    status: 'past_due',
    gracePeriodEnd,
  });

  logger.info({ clinicId, tier: subscription.tier, amount, dueDate }, 'Billing invoice generated');

  return {
    clinicId,
    tier: subscription.tier,
    amount,
    currency: 'USD',
    dueDate,
    gracePeriodEnd,
    stellarPaymentAddress: subscription.stellarPaymentAddress ?? clinic.stellarPublicKey,
  };
}

export async function handlePaymentSuccess(clinicId: string | Types.ObjectId, paymentIntentId: string) {
  const subscription = await SubscriptionModel.findOne({ clinicId });
  if (!subscription) return;

  const now = new Date();
  const nextPeriodStart = new Date(subscription.currentPeriodEnd);
  const nextPeriodEnd = new Date(nextPeriodStart);
  nextPeriodEnd.setMonth(nextPeriodEnd.getMonth() + 1);

  await SubscriptionModel.findByIdAndUpdate(subscription._id, {
    status: 'active',
    currentPeriodStart: nextPeriodStart,
    currentPeriodEnd: nextPeriodEnd,
    lastPaymentIntentId: paymentIntentId,
    lastPaymentAt: now,
    gracePeriodEnd: undefined,
  });

  logger.info({ clinicId, paymentIntentId }, 'Subscription payment recorded, period renewed');
}

export async function suspendOverdueAccounts() {
  const now = new Date();
  const result = await SubscriptionModel.updateMany(
    { status: 'past_due', gracePeriodEnd: { $lt: now } },
    { $set: { status: 'suspended' } }
  );

  if (result.modifiedCount > 0) {
    logger.info({ count: result.modifiedCount }, 'Accounts suspended after grace period');
  }

  return result.modifiedCount;
}

export async function renewSubscriptionPeriod(clinicId: string | Types.ObjectId) {
  const subscription = await SubscriptionModel.findOne({ clinicId });
  if (!subscription) return;

  const now = new Date();
  const nextEnd = new Date(now);
  nextEnd.setMonth(nextEnd.getMonth() + 1);

  await SubscriptionModel.findByIdAndUpdate(subscription._id, {
    currentPeriodStart: now,
    currentPeriodEnd: nextEnd,
    status: 'active',
    gracePeriodEnd: undefined,
  });
}
