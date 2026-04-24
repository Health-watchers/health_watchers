import { Request, Response, NextFunction } from 'express';
import { SubscriptionModel } from '../modules/subscriptions/subscription.model';
import { UsageModel } from '../modules/subscriptions/usage.model';
import { TIER_LIMITS } from '../modules/subscriptions/subscription.tiers';

type LimitKey = 'patients' | 'encounters' | 'ai' | 'doctors';

export function checkSubscriptionLimit(resource: LimitKey) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const clinicId = req.user?.clinicId;
    if (!clinicId) return next();

    const subscription = await SubscriptionModel.findOne({ clinicId });
    if (!subscription) return next();

    if (subscription.status === 'suspended') {
      return res.status(402).json({
        error: 'AccountSuspended',
        message: 'Your account has been suspended due to non-payment. Please update your billing information.',
        upgradeUrl: '/settings?section=subscription',
      });
    }

    const limits = TIER_LIMITS[subscription.tier];
    const now = new Date();
    const usage = await UsageModel.findOne({
      clinicId,
      periodStart: { $lte: now },
      periodEnd: { $gte: now },
    });

    const current = usage ?? { patientCount: 0, encounterCount: 0, aiRequestCount: 0, doctorCount: 0 };

    const checks: Record<LimitKey, { count: number; limit: number; label: string }> = {
      patients: { count: current.patientCount, limit: limits.maxPatients, label: 'patient' },
      encounters: { count: current.encounterCount, limit: limits.maxEncountersPerMonth, label: 'encounter' },
      ai: { count: current.aiRequestCount, limit: limits.maxAiRequestsPerMonth, label: 'AI request' },
      doctors: { count: current.doctorCount, limit: limits.maxDoctors, label: 'doctor' },
    };

    const { count, limit, label } = checks[resource];

    if (limit !== Infinity && count >= limit) {
      return res.status(402).json({
        error: 'SubscriptionLimitExceeded',
        message: `You have reached the ${label} limit for your ${subscription.tier} plan.`,
        limit,
        current: count,
        tier: subscription.tier,
        upgradeUrl: '/settings?section=subscription',
      });
    }

    return next();
  };
}
