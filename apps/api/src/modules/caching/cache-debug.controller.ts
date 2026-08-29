import { Router, Request, Response } from 'express';
import { advancedCaching } from '../../services/advanced-caching.service';
import { requireAuth } from '../../middlewares/auth.middleware';
import { requireRole } from '../../middlewares/role.middleware';
import logger from '../../utils/logger';

const router = Router();

router.get('/cache/metrics', requireAuth, requireRole('admin'), (_req: Request, res: Response) => {
  try {
    const metrics = advancedCaching.getMetrics();
    res.json(metrics);
  } catch (err) {
    logger.error({ err }, '[cache-debug] Failed to get metrics');
    res.status(500).json({ error: 'Failed to fetch cache metrics' });
  }
});

router.get('/cache/debug', requireAuth, requireRole('admin'), (_req: Request, res: Response) => {
  try {
    const debugInfo = advancedCaching.getDebugInfo();
    res.json(debugInfo);
  } catch (err) {
    logger.error({ err }, '[cache-debug] Failed to get debug info');
    res.status(500).json({ error: 'Failed to fetch cache debug info' });
  }
});

router.get('/cache/entries', requireAuth, requireRole('admin'), (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 50;
    const debugInfo = advancedCaching.getDebugInfo();
    const entries = debugInfo.entries.slice(0, limit);
    res.json({ entries, total: debugInfo.entries.length });
  } catch (err) {
    logger.error({ err }, '[cache-debug] Failed to get entries');
    res.status(500).json({ error: 'Failed to fetch cache entries' });
  }
});

router.post('/cache/clear', requireAuth, requireRole('admin'), (_req: Request, res: Response) => {
  try {
    advancedCaching.clear();
    res.json({ message: 'Cache cleared successfully' });
  } catch (err) {
    logger.error({ err }, '[cache-debug] Failed to clear cache');
    res.status(500).json({ error: 'Failed to clear cache' });
  }
});

router.post('/cache/evict', requireAuth, requireRole('admin'), (req: Request, res: Response) => {
  try {
    const maxEntries = parseInt(req.body.maxEntries as string) || 1000;
    const evicted = advancedCaching.evict(maxEntries);
    res.json({ evicted, message: `${evicted} entries evicted` });
  } catch (err) {
    logger.error({ err }, '[cache-debug] Failed to evict cache');
    res.status(500).json({ error: 'Failed to evict cache' });
  }
});

export const cacheDebugRouter = router;
