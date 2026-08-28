import { Router, Request, Response } from 'express';
import { errorAnalytics } from '../../services/error-analytics.service';
import { requireAuth } from '../../middlewares/auth.middleware';
import { requireRole } from '../../middlewares/role.middleware';
import logger from '../../utils/logger';

const router = Router();

router.get('/errors/analytics/summary', requireAuth, requireRole('admin'), (_req: Request, res: Response) => {
  try {
    const summary = errorAnalytics.getSummary();
    res.json(summary);
  } catch (err) {
    logger.error({ err }, '[error-analytics] Failed to get summary');
    res.status(500).json({ error: 'Failed to fetch error analytics summary' });
  }
});

router.get('/errors/analytics/by-code', requireAuth, requireRole('admin'), (req: Request, res: Response) => {
  try {
    const code = req.query.code as string | undefined;
    const errors = errorAnalytics.getErrorAnalytics(code);
    res.json({ errors });
  } catch (err) {
    logger.error({ err }, '[error-analytics] Failed to get errors by code');
    res.status(500).json({ error: 'Failed to fetch error analytics' });
  }
});

router.get('/errors/analytics/trends', requireAuth, requireRole('admin'), (req: Request, res: Response) => {
  try {
    const code = req.query.code as string | undefined;
    const hoursBack = parseInt(req.query.hoursBack as string) || 24;
    const trends = errorAnalytics.getErrorTrends(code, hoursBack);
    res.json({ trends });
  } catch (err) {
    logger.error({ err }, '[error-analytics] Failed to get trends');
    res.status(500).json({ error: 'Failed to fetch error trends' });
  }
});

router.get('/errors/analytics/top', requireAuth, requireRole('admin'), (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 10;
    const topErrors = errorAnalytics.getTopErrors(limit);
    res.json({ topErrors });
  } catch (err) {
    logger.error({ err }, '[error-analytics] Failed to get top errors');
    res.status(500).json({ error: 'Failed to fetch top errors' });
  }
});

router.get('/errors/analytics/critical', requireAuth, requireRole('admin'), (_req: Request, res: Response) => {
  try {
    const criticalErrors = errorAnalytics.getCriticalErrors();
    res.json({ criticalErrors });
  } catch (err) {
    logger.error({ err }, '[error-analytics] Failed to get critical errors');
    res.status(500).json({ error: 'Failed to fetch critical errors' });
  }
});

router.get('/errors/analytics/distribution', requireAuth, requireRole('admin'), (_req: Request, res: Response) => {
  try {
    const severity = errorAnalytics.getSeverityDistribution();
    const category = errorAnalytics.getCategoryDistribution();
    res.json({ severity, category });
  } catch (err) {
    logger.error({ err }, '[error-analytics] Failed to get distribution');
    res.status(500).json({ error: 'Failed to fetch error distribution' });
  }
});

export const errorAnalyticsRouter = router;
