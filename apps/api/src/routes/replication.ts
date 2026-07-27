import { Router, Request, Response } from 'express';
import { authenticate } from '@/middleware/auth';
import { authorize } from '@/middleware/authorization';
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
router.get('/status', authenticate, authorize(['admin']), async (req: Request, res: Response) => {
  try {
    const healthStatus = await getReplicationHealthStatus();

    res.json({
      success: true,
      data: healthStatus,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({
      error: 'Failed to get replication status',
      message: errorMessage,
    });
  }
});

/**
 * GET /api/v1/replication/lag
 * Get replication lag metrics
 */
router.get('/lag', authenticate, authorize(['admin']), async (req: Request, res: Response) => {
  try {
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
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({
      error: 'Failed to get replication lag',
      message: errorMessage,
    });
  }
});

/**
 * GET /api/v1/replication/consistency
 * Get replication consistency metrics
 */
router.get('/consistency', authenticate, authorize(['admin']), async (req: Request, res: Response) => {
  try {
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
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({
      error: 'Failed to get consistency metrics',
      message: errorMessage,
    });
  }
});

/**
 * POST /api/v1/replication/test-failover
 * Test failover procedures
 */
router.post('/test-failover', authenticate, authorize(['admin']), async (req: Request, res: Response) => {
  try {
    const testResult = await testFailover();

    res.json({
      success: testResult.success,
      data: testResult,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({
      error: 'Failover test failed',
      message: errorMessage,
    });
  }
});

/**
 * GET /api/v1/replication/read-preferences
 * Get available read preference configurations
 */
router.get('/read-preferences', authenticate, authorize(['admin']), (req: Request, res: Response) => {
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
});

/**
 * GET /api/v1/replication/metrics
 * Get detailed replication metrics
 */
router.get('/metrics', authenticate, authorize(['admin']), async (req: Request, res: Response) => {
  try {
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
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({
      error: 'Failed to get metrics',
      message: errorMessage,
    });
  }
});

export default router;
