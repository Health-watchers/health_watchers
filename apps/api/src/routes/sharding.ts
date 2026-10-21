/**
 * Sharding Admin Routes — Issue #1077
 *
 * All endpoints require admin role.
 *
 * GET  /api/v1/sharding/health          — overall shard health
 * GET  /api/v1/sharding/strategy        — configured sharding strategies
 * GET  /api/v1/sharding/balance/:collection — balance report for a collection
 * POST /api/v1/sharding/health-check    — trigger live health-check ping
 * GET  /api/v1/sharding/route           — determine shard for a document key
 */

import { Router, Request, Response } from 'express';
import { authenticate } from '@api/middlewares/auth.middleware';
import { authorize } from '@api/middlewares/rbac.middleware';
import { ShardingService } from '../services/sharding.service';

const router = Router();

/**
 * GET /api/v1/sharding/health
 * Returns an in-memory summary of shard statuses.
 */
router.get('/health', authenticate, authorize(['admin']), (_req: Request, res: Response) => {
  try {
    const service = ShardingService.getInstance();
    const health = service.getShardHealth();

    const httpStatus = health.healthyCount === 0 ? 503 : health.unavailable.length > 0 ? 207 : 200;

    res.status(httpStatus).json({
      success: true,
      data: health,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ error: 'Failed to get shard health', message });
  }
});

/**
 * POST /api/v1/sharding/health-check
 * Proactively pings each shard and updates statuses.
 */
router.post(
  '/health-check',
  authenticate,
  authorize(['admin']),
  async (_req: Request, res: Response) => {
    try {
      const service = ShardingService.getInstance();
      const health = await service.performHealthChecks();

      res.json({
        success: true,
        message: 'Health checks completed',
        data: health,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: 'Health check failed', message });
    }
  }
);

/**
 * GET /api/v1/sharding/strategy
 * Returns all configured sharding strategies.
 */
router.get('/strategy', authenticate, authorize(['admin']), (_req: Request, res: Response) => {
  try {
    const service = ShardingService.getInstance();
    const strategy = service.getShardingStrategy();

    res.json({
      success: true,
      data: {
        collections: Object.keys(strategy),
        strategies: strategy,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ error: 'Failed to get sharding strategy', message });
  }
});

/**
 * GET /api/v1/sharding/balance/:collection
 * Returns a balance report for the given collection.
 */
router.get(
  '/balance/:collection',
  authenticate,
  authorize(['admin']),
  (req: Request, res: Response) => {
    try {
      const { collection } = req.params;
      const service = ShardingService.getInstance();
      const report = service.getBalanceReport(collection);

      res.json({
        success: true,
        data: report,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: 'Failed to get balance report', message });
    }
  }
);

/**
 * GET /api/v1/sharding/route?collection=&key=
 * Determine which shard a given key would be routed to (read-only, no side effects).
 */
router.get('/route', authenticate, authorize(['admin']), (req: Request, res: Response) => {
  const { collection, key } = req.query as { collection?: string; key?: string };

  if (!collection || !key) {
    return res.status(400).json({
      error: 'Missing required query params: collection, key',
    });
  }

  try {
    const service = ShardingService.getInstance();
    const route = service.getShardForDocument(collection, key);

    res.json({
      success: true,
      data: {
        collection,
        key,
        ...route,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ error: 'Routing failed', message });
  }
});

export default router;
