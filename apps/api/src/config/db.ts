import mongoose from 'mongoose';
import { config } from '@health-watchers/config';
import logger from '../utils/logger';

const MAX_RETRIES = 5;
const BASE_DELAY_MS = 1_000;
const MAX_POOL = parseInt(process.env.MONGODB_POOL_SIZE ?? '10', 10);
const POOL_WARN_THRESHOLD = 0.8;

const POOL_OPTIONS = {
  maxPoolSize: MAX_POOL,
  minPoolSize: 2,
  maxConnecting: 2,
  serverSelectionTimeoutMS: 5_000,
  socketTimeoutMS: 45_000,
  connectTimeoutMS: 10_000,
  heartbeatFrequencyMS: 10_000,
  waitQueueTimeoutMS: 5_000,
};

// ── Connection event listeners ────────────────────────────────────────────────
mongoose.connection.on('connected', () =>
  logger.info({ event: 'db:connected', poolSize: POOL_OPTIONS.maxPoolSize }, 'MongoDB connected')
);
mongoose.connection.on('disconnected', () =>
  logger.warn({ event: 'db:disconnected' }, 'MongoDB disconnected')
);
mongoose.connection.on('reconnected', () =>
  logger.info({ event: 'db:reconnected' }, 'MongoDB reconnected')
);
mongoose.connection.on('error', (err) =>
  logger.error({ event: 'db:error', err }, 'MongoDB connection error')
);

// ── Connect with exponential-backoff retry ────────────────────────────────────
export async function connectDB(): Promise<void> {
  if (!config.mongoUri) {
    logger.error('MONGO_URI is not set');
    process.exit(1);
  }

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      await mongoose.connect(config.mongoUri, POOL_OPTIONS);
      logger.info(
        { maxPoolSize: POOL_OPTIONS.maxPoolSize, minPoolSize: POOL_OPTIONS.minPoolSize },
        'MongoDB connection pool ready'
      );
      _startPoolMonitoring();
      return;
    } catch (err) {
      const delay = BASE_DELAY_MS * Math.pow(2, attempt - 1); // 1s, 2s, 4s, 8s, 16s
      if (attempt === MAX_RETRIES) {
        logger.error({ err, attempt }, 'MongoDB connection failed after max retries');
        process.exit(1);
      }
      logger.warn({ err, attempt, retryInMs: delay }, 'MongoDB connection failed, retrying…');
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}

/** Returns the current DB connection status for health checks */
export function getDbStatus(): 'connected' | 'connecting' | 'disconnected' | 'disconnecting' {
  const states: Record<number, 'disconnected' | 'connected' | 'connecting' | 'disconnecting'> = {
    0: 'disconnected', 1: 'connected', 2: 'connecting', 3: 'disconnecting',
  };
  return states[mongoose.connection.readyState] ?? 'disconnected';
}

export interface PoolMetrics {
  status: ReturnType<typeof getDbStatus>;
  totalConnections: number;
  availableConnections: number;
  waitQueueSize: number;
  maxPoolSize: number;
  utilization: number;
}

/** Returns real-time connection pool metrics for monitoring and health checks. */
export function getPoolMetrics(): PoolMetrics {
  const pool = (mongoose.connection as any).pool;
  const totalConnections: number = pool?.totalConnectionCount ?? 0;
  const availableConnections: number = pool?.availableConnectionCount ?? 0;
  const waitQueueSize: number = pool?.waitQueueSize ?? 0;
  const utilization = MAX_POOL > 0 ? totalConnections / MAX_POOL : 0;
  return {
    status: getDbStatus(),
    totalConnections,
    availableConnections,
    waitQueueSize,
    maxPoolSize: MAX_POOL,
    utilization,
  };
}

let _monitorInterval: ReturnType<typeof setInterval> | null = null;

function _startPoolMonitoring(): void {
  if (_monitorInterval) return;
  _monitorInterval = setInterval(() => {
    const m = getPoolMetrics();
    if (m.utilization >= POOL_WARN_THRESHOLD) {
      logger.warn(
        { event: 'db:pool:high_utilization', ...m },
        'MongoDB connection pool utilization is high'
      );
    }
    if (m.waitQueueSize > 0) {
      logger.warn(
        { event: 'db:pool:wait_queue', waitQueueSize: m.waitQueueSize },
        'MongoDB connection pool has queued requests'
      );
    }
  }, 30_000);
  _monitorInterval.unref();
}
