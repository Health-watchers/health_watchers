import { Request, Response, NextFunction } from 'express';
import { SubscriptionModel } from '../modules/subscriptions/subscription.model';
import { UsageModel } from '../modules/subscriptions/usage.model';
import { TIER_LIMITS } from '../modules/subscriptions/subscription.tiers';
import { createNotification } from '../modules/notifications/notification.service';
import { UserModel } from '../modules/auth/models/user.model';
import logger from '../utils/logger';

type LimitKey = 'patients' | 'encounters' | 'ai' | 'doctors' | 'users';

export function checkSubscriptionLimit(resource: LimitKey) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const clinicId = req.user?.clinicId;
    if (!clinicId) return next();

    const subscription = await SubscriptionModel.findOne({ clinicId });
    if (!subscription) return next();

    if (subscription.status === 'suspended') {
      return res.status(402).json({
        error: 'AccountSuspended',
        message:
          'Your account has been suspended due to non-payment. Please update your billing information.',
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

    const current = usage ?? {
      patientCount: 0,
      encounterCount: 0,
      aiRequestCount: 0,
      doctorCount: 0,
      userCount: 0,
    };

    const checks: Record<LimitKey, { count: number; limit: number; label: string }> = {
      patients: { count: current.patientCount, limit: limits.maxPatients, label: 'patient' },
      encounters: {
        count: current.encounterCount,
        limit: limits.maxEncountersPerMonth,
        label: 'encounter',
      },
      ai: {
        count: current.aiRequestCount,
        limit: limits.maxAiRequestsPerMonth,
        label: 'AI request',
      },
      doctors: { count: current.doctorCount, limit: limits.maxDoctors, label: 'doctor' },
      users: { count: current.userCount, limit: limits.maxDoctors, label: 'user' },
    };

    const { count, limit, label } = checks[resource];
    const usagePercent = limit !== Infinity ? (count / limit) * 100 : 0;

    if (limit !== Infinity && count >= limit) {
      // Record metric for limit violation
      try {
        const { subscriptionLimitViolations } = await import('../services/metrics.service');
        subscriptionLimitViolations.inc({ tier: subscription.tier, resource });
      } catch (e) {
        // Metric service may not be available
      }

      return res.status(402).json({
        error: 'SubscriptionLimitExceeded',
        message: `You have reached the ${label} limit for your ${subscription.tier} plan.`,
        limit,
        current: count,
        tier: subscription.tier,
        upgradeUrl: '/settings?section=subscription',
      });
    }

    // Send warning notification at 80% usage
    if (limit !== Infinity && usagePercent >= 80 && usagePercent < 90) {
      try {
        const admins = await UserModel.find({
          clinicId,
          role: 'CLINIC_ADMIN',
          isActive: true,
        }).lean();
        for (const admin of admins) {
          await createNotification({
            userId: admin._id,
            clinicId,
            type: 'subscription_warning',
            title: 'Subscription Limit Warning',
            message: `Your clinic is at ${Math.round(usagePercent)}% of the ${label} limit for your ${subscription.tier} plan. Consider upgrading.`,
            link: '/settings?section=subscription',
            metadata: { resource, current, limit, usagePercent },
          });
        }
      } catch (err) {
        logger.error(
          { err, clinicId, resource },
          'Failed to send subscription warning notification'
        );
      }
    }

    return next();
  };
}
