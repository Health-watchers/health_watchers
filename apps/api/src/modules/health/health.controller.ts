import { Router, Request, Response } from 'express';
import mongoose from 'mongoose';
import { cache } from '../../services/cache.service';
import { stellarClient } from '../payments/services/stellar-client';
import { isAIServiceAvailable } from '../ai/ai.service';
import { config } from '@health-watchers/config';
import { getDbStatus, getPoolMetrics } from '../../config/db';
import { getJobStatus, CHECK_INTERVAL_MS } from '../payments/services/payment-expiration-job';

const router = Router();

/**
 * GET /health/startup - Startup probe: confirms the process has initialised
 * (DB connected, app ready to serve). Used by Kubernetes startupProbe.
 */
router.get('/startup', (req: Request, res: Response) => {
  const dbStatus = getDbStatus();
  const ready = dbStatus === 'connected';
  res.status(ready ? 200 : 503).json({
    status: ready ? 'started' : 'starting',
    database: dbStatus,
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
  });
});

/**
 * GET /health/live - Fast liveness check
 */
router.get('/live', (req: Request, res: Response) => {
  res.status(200).json({
    status: 'alive',
    service: 'health-watchers-api',
    database: getDbStatus(),
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
  });
});

/**
 * GET /health/ready - Comprehensive readiness check
 */
router.get('/ready', async (req: Request, res: Response) => {
  const checks: Record<string, any> = {};
  let isReady = true;

  // 1. MongoDB Check (CRITICAL)
  const mongoStart = Date.now();
  try {
    const mongoStatus = mongoose.connection.readyState;
    if (mongoStatus === 1) {
      await mongoose.connection.db?.admin().ping();
      const pool = getPoolMetrics();
      const poolExhausted = pool.waitQueueSize > 0 && pool.totalConnections >= pool.maxPoolSize;

      if (poolExhausted) {
        isReady = false;
        checks.mongodb = {
          status: 'unhealthy',
          message: 'Connection pool exhausted',
          pool,
          latency: Date.now() - mongoStart,
        };
      } else {
        checks.mongodb = {
          status: 'healthy',
          pool,
          latency: Date.now() - mongoStart,
        };
      }
    } else {
      isReady = false;
      checks.mongodb = {
        status: 'unhealthy',
        message: `Mongoose readyState: ${mongoStatus}`,
        latency: Date.now() - mongoStart,
      };
    }
  } catch (err) {
    isReady = false;
    checks.mongodb = {
      status: 'unhealthy',
      message: err instanceof Error ? err.message : 'Unknown error',
      latency: Date.now() - mongoStart,
    };
  }

  // 2. Redis Check (OPTIONAL - degraded if fails)
  const redisHealth = await cache.ping();
  checks.redis = redisHealth;

  // 3. Stellar Horizon Check (OPTIONAL - degraded if fails)
  const stellarStart = Date.now();
  try {
    const stellarHealth = await stellarClient.healthCheck();
    checks.stellarHorizon = {
      status: stellarHealth.status === 'ok' ? 'healthy' : 'degraded',
      latency: Date.now() - stellarStart,
      network: stellarHealth.network,
    };
  } catch (err) {
    checks.stellarHorizon = { 
      status: 'degraded', 
      message: err instanceof Error ? err.message : 'Connection failed',
      latency: Date.now() - stellarStart 
    };
  }

  // 4. Gemini API Check (OPTIONAL - degraded if fails)
  const hasGemini = isAIServiceAvailable();
  checks.geminiApi = {
    status: hasGemini ? 'healthy' : 'degraded',
    message: hasGemini ? undefined : 'API key not configured',
  };

  const response = {
    status: isReady ? 'ready' : 'unhealthy',
    checks,
    version: process.env.npm_package_version || '1.0.0',
    environment: process.env.NODE_ENV || 'development',
    timestamp: new Date().toISOString(),
  };

  res.status(isReady ? 200 : 503).json(response);
});

/**
 * GET /health/jobs - Background job health status
 */
router.get('/jobs', (_req: Request, res: Response) => {
  const expiration = getJobStatus();
  const intervalSeconds = CHECK_INTERVAL_MS / 1000;
  const stalledThresholdSeconds = intervalSeconds * 2;

  const isStalled =
    expiration.running &&
    expiration.lastSuccessfulRunAt !== null &&
    (Date.now() - expiration.lastSuccessfulRunAt.getTime()) / 1000 > stalledThresholdSeconds;

  const neverRan = expiration.running && expiration.lastSuccessfulRunAt === null;

  return res.status(200).json({
    status: isStalled ? 'degraded' : 'healthy',
    jobs: {
      paymentExpiration: {
        running: expiration.running,
        lastSuccessfulRunAt: expiration.lastSuccessfulRunAt?.toISOString() ?? null,
        consecutiveFailures: expiration.consecutiveFailures,
        intervalSeconds,
        stalledThresholdSeconds,
        stalled: isStalled,
        neverRan,
      },
    },
    timestamp: new Date().toISOString(),
  });
});

export const healthRoutes = router;
