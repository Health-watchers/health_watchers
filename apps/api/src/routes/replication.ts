import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '@/middlewares/auth.middleware';
import { authorize } from '@/middlewares/rbac.middleware';
import { asyncHandler } from '@/middlewares/error.middleware';
import {
  getReplicationLagMetrics,
  monitorConsistency,
  testFailover,
  getReplicationHealthStatus,
  READ_PREFERENCES,
} from '@/config/db-replication';

const router = Router();

/**
 * GET /api/v1/replication/status
 * Get comprehensive replication health status
 */
router.get(
  '/status',
  authenticate,
  authorize(['admin']),
  asyncHandler(async (req: Request, res: Response) => {
    const healthStatus = await getReplicationHealthStatus();

    res.json({
      success: true,
      data: healthStatus,
      timestamp: new Date().toISOString(),
    });
  })
);

/**
 * GET /api/v1/replication/lag
 * Get replication lag metrics
 */
router.get(
  '/lag',
  authenticate,
  authorize(['admin']),
  asyncHandler(async (req: Request, res: Response) => {
    const lagMetrics = await getReplicationLagMetrics();

    if (!lagMetrics) {
      return res.status(503).json({
        error: 'Replication lag metrics unavailable',
        message: 'Replica set status could not be retrieved',
      });
    }

    res.json({
      success: true,
      data: lagMetrics,
      timestamp: new Date().toISOString(),
    });
  })
);

/**
 * GET /api/v1/replication/consistency
 * Get replication consistency metrics
 */
router.get(
  '/consistency',
  authenticate,
  authorize(['admin']),
  asyncHandler(async (req: Request, res: Response) => {
    const consistency = await monitorConsistency();

    if (!consistency) {
      return res.status(503).json({
        error: 'Consistency metrics unavailable',
        message: 'Could not retrieve replica set status',
      });
    }

    res.json({
      success: true,
      data: consistency,
      timestamp: new Date().toISOString(),
    });
  })
);

/**
 * POST /api/v1/replication/test-failover
 * Test failover procedures
 */
router.post(
  '/test-failover',
  authenticate,
  authorize(['admin']),
  asyncHandler(async (req: Request, res: Response) => {
    const testResult = await testFailover();

    res.json({
      success: testResult.success,
      data: testResult,
      timestamp: new Date().toISOString(),
    });
  })
);

/**
 * GET /api/v1/replication/read-preferences
 * Get available read preference configurations
 */
router.get(
  '/read-preferences',
  authenticate,
  authorize(['admin']),
  (req: Request, res: Response) => {
    res.json({
      success: true,
      data: {
        available: Object.keys(READ_PREFERENCES),
        configurations: READ_PREFERENCES,
        description: {
          consistent: 'Critical operations requiring consistent reads from primary',
          highPriority: 'High-priority operations with primary preference',
          balanced: 'General purpose - balance consistency and scalability',
          analytics: 'Read-heavy analytics - tolerates staleness',
          lowest_latency: 'Nearest node - lowest latency',
        },
      },
      timestamp: new Date().toISOString(),
    });
  }
);

/**
 * GET /api/v1/replication/metrics
 * Get detailed replication metrics
 */
router.get(
  '/metrics',
  authenticate,
  authorize(['admin']),
  asyncHandler(async (req: Request, res: Response) => {
    const [lagMetrics, consistency] = await Promise.all([
      getReplicationLagMetrics(),
      monitorConsistency(),
    ]);

    const metrics = {
      lag: lagMetrics,
      consistency,
      timestamp: new Date().toISOString(),
    };

    res.json({
      success: true,
      data: metrics,
    });
  })
);

export default router;
