import { Router, Request, Response } from 'express';
import mongoose from 'mongoose';
import { cache } from '../../services/cache.service';
import { stellarClient } from '../payments/services/stellar-client';
import { isAIServiceAvailable } from '../ai/ai.service';
import { config } from '@health-watchers/config';

const router = Router();

/**
 * GET /health/live - Fast liveness check
 */
router.get('/live', (req: Request, res: Response) => {
  res.status(200).json({
    status: 'alive',
    uptime: process.uptime(),
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
    // 0 = disconnected, 1 = connected, 2 = connecting, 3 = disconnecting
    if (mongoStatus === 1) {
      // Perform a simple ping if connected
      await mongoose.connection.db?.admin().ping();
      checks.mongodb = { status: 'healthy', latency: Date.now() - mongoStart };
    } else {
      isReady = false;
      checks.mongodb = { 
        status: 'unhealthy', 
        message: `Mongoose readyState: ${mongoStatus}`,
        latency: Date.now() - mongoStart 
      };
    }
  } catch (err) {
    isReady = false;
    checks.mongodb = { 
      status: 'unhealthy', 
      message: err instanceof Error ? err.message : 'Unknown error',
      latency: Date.now() - mongoStart 
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

export const healthRoutes = router;
