import { Router, Request, Response } from 'express';
import {
  advancedRateLimiting,
  SubscriptionTier,
} from '../../services/advanced-rate-limiting.service';
import { authenticate as requireAuth } from '../../middlewares/auth.middleware';
import { requireRole } from '../../middlewares/role.middleware';
import logger from '../../utils/logger';

const router = Router();

router.get(
  '/rate-limits/tiers',
  requireAuth,
  requireRole('admin'),
  (_req: Request, res: Response) => {
    try {
      const tiers = Object.values(SubscriptionTier).map((tier) => ({
        tier,
        config: advancedRateLimiting.getTierConfig(tier as SubscriptionTier),
      }));
      res.json({ tiers });
    } catch (err) {
      logger.error({ err }, '[rate-limit-config] Failed to get tiers');
      res.status(500).json({ error: 'Failed to fetch rate limit tiers' });
    }
  }
);

router.get(
  '/rate-limits/metrics',
  requireAuth,
  requireRole('admin'),
  (_req: Request, res: Response) => {
    try {
      const metrics = advancedRateLimiting.getMetrics();
      res.json(metrics);
    } catch (err) {
      logger.error({ err }, '[rate-limit-config] Failed to get metrics');
      res.status(500).json({ error: 'Failed to fetch rate limit metrics' });
    }
  }
);

router.get(
  '/rate-limits/violations',
  requireAuth,
  requireRole('admin'),
  (req: Request, res: Response) => {
    try {
      const key = req.query.key as string;
      const hoursBack = parseInt(req.query.hoursBack as string) || 24;

      if (!key) {
        return res.status(400).json({ error: 'key query parameter is required' });
      }

      const violations = advancedRateLimiting.getViolations(key, hoursBack);
      res.json({ violations });
    } catch (err) {
      logger.error({ err }, '[rate-limit-config] Failed to get violations');
      res.status(500).json({ error: 'Failed to fetch violations' });
    }
  }
);

router.post(
  '/rate-limits/check',
  requireAuth,
  requireRole('admin'),
  async (req: Request, res: Response) => {
    try {
      const { key, tier = SubscriptionTier.BASIC, limitType = 'minute' } = req.body;

      if (!key) {
        return res.status(400).json({ error: 'key is required' });
      }

      const result = await advancedRateLimiting.checkRateLimit(key, tier, limitType);
      res.json(result);
    } catch (err) {
      logger.error({ err }, '[rate-limit-config] Failed to check rate limit');
      res.status(500).json({ error: 'Failed to check rate limit' });
    }
  }
);

router.post(
  '/rate-limits/reset',
  requireAuth,
  requireRole('admin'),
  (_req: Request, res: Response) => {
    try {
      advancedRateLimiting.resetCounters();
      res.json({ message: 'Rate limit counters reset' });
    } catch (err) {
      logger.error({ err }, '[rate-limit-config] Failed to reset counters');
      res.status(500).json({ error: 'Failed to reset counters' });
    }
  }
);

export const rateLimitConfigRouter = router;
