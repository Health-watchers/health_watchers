/**
 * Sharding Admin Routes — Issue #1077, #1799
 *
 * Mounted on the internal admin surface (/internal/sharding), not the public
 * /api/v1 prefix. All endpoints require the SUPER_ADMIN role; mutations
 * additionally require an MFA-verified session.
 *
 * GET  /internal/sharding/health          — overall shard health
 * GET  /internal/sharding/strategy        — configured sharding strategies
 * GET  /internal/sharding/balance/:collection — balance report for a collection
 * POST /internal/sharding/health-check    — trigger live health-check ping
 * GET  /internal/sharding/route           — determine shard for a document key
 */

import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '@api/middlewares/auth.middleware';
import { authorize } from '@api/middlewares/rbac.middleware';
import { asyncHandler } from '@api/utils/asyncHandler';
import { ShardingService } from '../services/sharding.service';

const router = Router();

/**
 * GET /internal/sharding/health
 * Returns an in-memory summary of shard statuses.
 */
router.get(
  '/health',
  authenticate,
  authorize(['admin']),
  asyncHandler(async (_req: Request, res: Response) => {
    const service = ShardingService.getInstance();
    const health = service.getShardHealth();

    const httpStatus = health.healthyCount === 0 ? 503 : health.unavailable.length > 0 ? 207 : 200;

    res.status(httpStatus).json({
      success: true,
      data: health,
      timestamp: new Date().toISOString(),
    });
  })
);

/**
 * POST /internal/sharding/health-check
 * Proactively pings each shard and updates statuses.
 */
router.post(
  '/health-check',
  authenticate,
  authorize(['admin']),
  asyncHandler(async (_req: Request, res: Response) => {
    const service = ShardingService.getInstance();
    const health = await service.performHealthChecks();

    res.json({
      success: true,
      message: 'Health checks completed',
      data: health,
      timestamp: new Date().toISOString(),
    });
  })
);

/**
 * GET /internal/sharding/strategy
 * Returns all configured sharding strategies.
 */
router.get(
  '/strategy',
  authenticate,
  authorize(['admin']),
  asyncHandler(async (_req: Request, res: Response) => {
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
  })
);

/**
 * GET /internal/sharding/balance/:collection
 * Returns a balance report for the given collection.
 */
router.get(
  '/balance/:collection',
  authenticate,
  authorize(['admin']),
  asyncHandler(async (req: Request, res: Response) => {
    const { collection } = req.params;
    const service = ShardingService.getInstance();
    const report = service.getBalanceReport(collection);

    res.json({
      success: true,
      data: report,
      timestamp: new Date().toISOString(),
    });
  })
);

/**
 * GET /internal/sharding/route?collection=&key=
 * Determine which shard a given key would be routed to (read-only, no side effects).
 */
router.get(
  '/route',
  authenticate,
  authorize(['admin']),
  asyncHandler(async (req: Request, res: Response) => {
    const { collection, key } = req.query as { collection?: string; key?: string };

    if (!collection || !key) {
      return res.status(400).json({
        error: 'Missing required query params: collection, key',
      });
    }

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
  })
);

export default router;
