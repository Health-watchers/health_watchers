import mongoose from 'mongoose';
import os from 'os';
import { cache } from '../../services/cache.service';
import { stellarClient } from '../payments/services/stellar-client';
import { isAIServiceAvailable } from '../ai/ai.service';
import { getDbStatus, getPoolMetrics } from '../../config/db';
import { getErrorMetrics } from '../../middlewares/error.middleware';
import { getJobStatus, CHECK_INTERVAL_MS } from '../payments/services/payment-expiration-job';
import logger from '../../utils/logger';

export type ServiceStatus = 'healthy' | 'degraded' | 'unhealthy' | 'unknown';

export interface ServiceCheck {
  status: ServiceStatus;
  latencyMs?: number;
  message?: string;
  details?: Record<string, any>;
}

export interface ComprehensiveHealthResult {
  status: ServiceStatus;
  version: string;
  environment: string;
  uptime: number;
  timestamp: string;
  services: Record<string, ServiceCheck>;
  system: SystemInfo;
  summary: {
    total: number;
    healthy: number;
    degraded: number;
    unhealthy: number;
  };
}

export interface SystemInfo {
  hostname: string;
  platform: string;
  nodeVersion: string;
  memoryUsage: {
    rss: number;
    heapUsed: number;
    heapTotal: number;
    external: number;
  };
  memoryPercentage: number;
  cpuUsage: {
    user: number;
    system: number;
  };
  loadAverage: number[];
  uptime: number;
}

const healthHistory: Array<{
  timestamp: string;
  status: ServiceStatus;
  services: Record<string, ServiceStatus>;
}> = [];

const MAX_HISTORY = 100;

function getSystemInfo(): SystemInfo {
  const mem = process.memoryUsage();
  const totalMem = os.totalmem();
  return {
    hostname: os.hostname(),
    platform: os.platform(),
    nodeVersion: process.version,
    memoryUsage: {
      rss: mem.rss,
      heapUsed: mem.heapUsed,
      heapTotal: mem.heapTotal,
      external: mem.external,
    },
    memoryPercentage: Math.round((mem.heapUsed / mem.heapTotal) * 100),
    cpuUsage: process.cpuUsage(),
    loadAverage: os.loadavg(),
    uptime: Math.floor(process.uptime()),
  };
}

async function checkMongoDB(): Promise<ServiceCheck> {
  const start = Date.now();
  try {
    const readyState = mongoose.connection.readyState;
    if (readyState !== 1) {
      return {
        status: 'unhealthy',
        latencyMs: Date.now() - start,
        message: `Mongoose readyState: ${readyState}`,
      };
    }
    await mongoose.connection.db?.admin().ping();
    const pool = getPoolMetrics();
    const poolExhausted = pool.waitQueueSize > 0 && pool.totalConnections >= pool.maxPoolSize;
    return {
      status: poolExhausted ? 'degraded' : 'healthy',
      latencyMs: Date.now() - start,
      message: poolExhausted ? 'Connection pool exhausted' : undefined,
      details: pool,
    };
  } catch (err) {
    return {
      status: 'unhealthy',
      latencyMs: Date.now() - start,
      message: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}

async function checkRedis(): Promise<ServiceCheck> {
  const start = Date.now();
  try {
    const result = await cache.ping();
    return {
      status: result.status === 'healthy' ? 'healthy' : 'degraded',
      latencyMs: Date.now() - start,
      message: result.message,
      details: result,
    };
  } catch (err) {
    return {
      status: 'degraded',
      latencyMs: Date.now() - start,
      message: err instanceof Error ? err.message : 'Connection failed',
    };
  }
}

async function checkStellar(): Promise<ServiceCheck> {
  const start = Date.now();
  try {
    const health = await stellarClient.healthCheck();
    return {
      status: health.status === 'ok' ? 'healthy' : 'degraded',
      latencyMs: Date.now() - start,
      details: { network: health.network },
    };
  } catch (err) {
    return {
      status: 'degraded',
      latencyMs: Date.now() - start,
      message: err instanceof Error ? err.message : 'Connection failed',
    };
  }
}

function checkGemini(): ServiceCheck {
  const available = isAIServiceAvailable();
  return {
    status: available ? 'healthy' : 'degraded',
    message: available ? undefined : 'API key not configured',
  };
}

function checkMemory(): ServiceCheck {
  const mem = process.memoryUsage();
  const percentage = Math.round((mem.heapUsed / mem.heapTotal) * 100);
  if (percentage > 90) {
    return {
      status: 'unhealthy',
      message: `Heap usage at ${percentage}%`,
      details: { percentage },
    };
  }
  if (percentage > 75) {
    return { status: 'degraded', message: `Heap usage at ${percentage}%`, details: { percentage } };
  }
  return { status: 'healthy', details: { percentage } };
}

function checkBackgroundJobs(): ServiceCheck {
  const expiration = getJobStatus();
  const intervalSeconds = CHECK_INTERVAL_MS / 1000;
  const stalledThreshold = intervalSeconds * 2;
  const isStalled =
    expiration.running &&
    expiration.lastSuccessfulRunAt !== null &&
    (Date.now() - expiration.lastSuccessfulRunAt.getTime()) / 1000 > stalledThreshold;

  if (isStalled) {
    return { status: 'degraded', message: 'Payment expiration job stalled' };
  }
  return {
    status: 'healthy',
    details: {
      running: expiration.running,
      lastRun: expiration.lastSuccessfulRunAt?.toISOString(),
      consecutiveFailures: expiration.consecutiveFailures,
    },
  };
}

function checkErrorRate(): ServiceCheck {
  const metrics = getErrorMetrics();
  const criticalErrors = metrics.bySeverity.critical + metrics.bySeverity.high;
  if (criticalErrors > 10) {
    return {
      status: 'unhealthy',
      message: `${criticalErrors} critical/high errors`,
      details: metrics,
    };
  }
  if (criticalErrors > 5) {
    return {
      status: 'degraded',
      message: `${criticalErrors} critical/high errors`,
      details: metrics,
    };
  }
  return { status: 'healthy', details: metrics };
}

function determineOverallStatus(services: Record<string, ServiceCheck>): ServiceStatus {
  const statuses = Object.values(services).map((s) => s.status);
  if (statuses.includes('unhealthy')) return 'unhealthy';
  if (statuses.includes('degraded')) return 'degraded';
  if (statuses.every((s) => s === 'healthy' || s === 'unknown')) return 'healthy';
  return 'degraded';
}

export async function runComprehensiveHealthCheck(): Promise<ComprehensiveHealthResult> {
  const [mongodb, redis, stellar, gemini, memory, jobs, errors] = await Promise.all([
    checkMongoDB(),
    checkRedis(),
    checkStellar(),
    Promise.resolve(checkGemini()),
    Promise.resolve(checkMemory()),
    Promise.resolve(checkBackgroundJobs()),
    Promise.resolve(checkErrorRate()),
  ]);

  const services: Record<string, ServiceCheck> = {
    mongodb,
    redis,
    stellarHorizon: stellar,
    geminiApi: gemini,
    memory,
    backgroundJobs: jobs,
    errorRate: errors,
  };

  const status = determineOverallStatus(services);
  const system = getSystemInfo();

  const summary = {
    total: Object.keys(services).length,
    healthy: Object.values(services).filter((s) => s.status === 'healthy').length,
    degraded: Object.values(services).filter((s) => s.status === 'degraded').length,
    unhealthy: Object.values(services).filter((s) => s.status === 'unhealthy').length,
  };

  const result: ComprehensiveHealthResult = {
    status,
    version: process.env.npm_package_version || '1.0.0',
    environment: process.env.NODE_ENV || 'development',
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
    services,
    system,
    summary,
  };

  healthHistory.push({
    timestamp: result.timestamp,
    status: result.status,
    services: Object.fromEntries(Object.entries(services).map(([k, v]) => [k, v.status])),
  });
  if (healthHistory.length > MAX_HISTORY) {
    healthHistory.shift();
  }

  return result;
}

export function getHealthHistory(): typeof healthHistory {
  return [...healthHistory];
}

export function getServiceDependencyMap(): Record<string, string[]> {
  return {
    api: ['mongodb', 'redis'],
    payments: ['mongodb', 'redis', 'stellarHorizon'],
    ai: ['mongodb', 'geminiApi'],
    appointments: ['mongodb', 'redis'],
    webhooks: ['mongodb'],
    email: ['mongodb'],
  };
}
