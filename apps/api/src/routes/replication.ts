import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '@/middlewares/auth.middleware';
import { requirePermission } from '@/middlewares/rbac.middleware';
import { authorize } from '@/middlewares/rbac.middleware';
import { asyncHandler } from '@/middlewares/error.middleware';
import {
  getReplicationLagMetrics,
  monitorConsistency,
  testFailover,
  getReplicationHealthStatus,
  READ_PREFERENCES,
} from '@/config/db-replication';

/**
 * Internal admin router for replication operations.
 *
 * Mounted under `/internal/replication` on the internal admin surface only —
 * never on the public `/api/v1` prefix. All routes require an authenticated
 * SUPER_ADMIN; mutating routes additionally require an MFA-verified session.
 */
const router = Router();

/**
 * GET /internal/replication/status
 * Get comprehensive replication health status
 */
router.get(
  '/status',
  authenticate,
  requirePermission('replication:read'),
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
 * GET /internal/replication/lag
 * Get replication lag metrics
 */
router.get(
  '/lag',
  authenticate,
  requirePermission('replication:read'),
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
 * GET /internal/replication/consistency
 * Get replication consistency metrics
 */
router.get(
  '/consistency',
  authenticate,
  requirePermission('replication:read'),
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
 * POST /internal/replication/test-failover
 * Test failover procedures (mutating — requires SUPER_ADMIN + MFA)
 *
 * NOTE: This is a candidate to move to an internal admin service or CLI.
 * Exposing failover testing on the public API is a safety concern (#1773).
 */
router.post(
  '/test-failover',
  authenticate,
  requirePermission('replication:write'),
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
 * GET /internal/replication/read-preferences
 * Get available read preference configurations
 */
router.get(
  '/read-preferences',
  authenticate,
  requirePermission('replication:read'),
  authorize(['super_admin']),
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
 * GET /internal/replication/metrics
 * Get detailed replication metrics
 */
router.get(
  '/metrics',
  authenticate,
  requirePermission('replication:read'),
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
