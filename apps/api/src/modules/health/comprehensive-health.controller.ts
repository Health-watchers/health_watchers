import { Router, Request, Response } from 'express';
import {
  runComprehensiveHealthCheck,
  getHealthHistory,
  getServiceDependencyMap,
} from './health-check.service';

const router = Router();

/**
 * GET /api/v1/health/comprehensive - Full health check with all services
 * Returns detailed status of every service, system metrics, and summary
 */
router.get('/comprehensive', async (_req: Request, res: Response) => {
  const result = await runComprehensiveHealthCheck();
  const httpStatus = result.status === 'unhealthy' ? 503 : 200;
  res.status(httpStatus).json(result);
});

/**
 * GET /api/v1/health/history - Health check history (last 100 checks)
 */
router.get('/history', (_req: Request, res: Response) => {
  const history = getHealthHistory();
  res.status(200).json({
    status: 'ok',
    count: history.length,
    data: history,
    timestamp: new Date().toISOString(),
  });
});

/**
 * GET /api/v1/health/dependencies - Service dependency map
 */
router.get('/dependencies', (_req: Request, res: Response) => {
  const dependencies = getServiceDependencyMap();
  res.status(200).json({
    status: 'ok',
    dependencies,
    timestamp: new Date().toISOString(),
  });
});

/**
 * GET /api/v1/health/system - System metrics (memory, CPU, load)
 */
router.get('/system', (_req: Request, res: Response) => {
  const os = require('os');
  const mem = process.memoryUsage();
  const totalMem = os.totalmem();
  const freeMem = os.freemem();

  res.status(200).json({
    status: 'ok',
    system: {
      hostname: os.hostname(),
      platform: os.platform(),
      arch: os.arch(),
      nodeVersion: process.version,
      uptime: Math.floor(process.uptime()),
      memory: {
        total: totalMem,
        free: freeMem,
        used: totalMem - freeMem,
        usagePercentage: Math.round(((totalMem - freeMem) / totalMem) * 100),
        process: {
          rss: mem.rss,
          heapUsed: mem.heapUsed,
          heapTotal: mem.heapTotal,
          external: mem.external,
          heapUsagePercentage: Math.round((mem.heapUsed / mem.heapTotal) * 100),
        },
      },
      cpu: {
        model: os.cpus()[0]?.model || 'unknown',
        cores: os.cpus().length,
        loadAverage: os.loadavg(),
      },
    },
    timestamp: new Date().toISOString(),
  });
});

/**
 * GET /api/v1/health/quick - Quick status (fastest endpoint, no service checks)
 */
router.get('/quick', (_req: Request, res: Response) => {
  res.status(200).json({
    status: 'ok',
    service: 'health-watchers-api',
    version: process.env.npm_package_version || '1.0.0',
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
  });
});

export const comprehensiveHealthRoutes = router;
