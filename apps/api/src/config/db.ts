import mongoose from 'mongoose';
import { config } from '@health-watchers/config';
import logger from '../utils/logger';

const MAX_RETRIES = 5;
const BASE_DELAY_MS = 1_000;
const MAX_POOL = parsePositiveInt(process.env.MONGODB_POOL_SIZE, 10);
const MIN_POOL = Math.min(parsePositiveInt(process.env.MONGODB_MIN_POOL_SIZE, 2), MAX_POOL);
const POOL_WARN_THRESHOLD = parseFloat(process.env.MONGODB_POOL_WARN_THRESHOLD ?? '0.8');
const POOL_CRITICAL_THRESHOLD = parseFloat(process.env.MONGODB_POOL_CRITICAL_THRESHOLD ?? '0.95');
const MONITOR_INTERVAL_MS = parsePositiveInt(process.env.MONGODB_MONITOR_INTERVAL_MS, 30_000);

const POOL_OPTIONS = {
  maxPoolSize: MAX_POOL,
  minPoolSize: MIN_POOL,
  maxConnecting: parsePositiveInt(process.env.MONGODB_MAX_CONNECTING, 2),
  serverSelectionTimeoutMS: parsePositiveInt(
    process.env.MONGODB_SERVER_SELECTION_TIMEOUT_MS,
    5_000
  ),
  socketTimeoutMS: parsePositiveInt(process.env.MONGODB_SOCKET_TIMEOUT_MS, 45_000),
  connectTimeoutMS: parsePositiveInt(process.env.MONGODB_CONNECT_TIMEOUT_MS, 10_000),
  heartbeatFrequencyMS: parsePositiveInt(process.env.MONGODB_HEARTBEAT_FREQUENCY_MS, 10_000),
  waitQueueTimeoutMS: parsePositiveInt(process.env.MONGODB_WAIT_QUEUE_TIMEOUT_MS, 5_000),
};

function parsePositiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

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
    0: 'disconnected',
    1: 'connected',
    2: 'connecting',
    3: 'disconnecting',
  };
  return states[mongoose.connection.readyState] ?? 'disconnected';
}

export interface PoolMetrics {
  status: ReturnType<typeof getDbStatus>;
  totalConnections: number;
  availableConnections: number;
  waitQueueSize: number;
  maxPoolSize: number;
  minPoolSize: number;
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
    minPoolSize: MIN_POOL,
    utilization,
  };
}

let _monitorInterval: ReturnType<typeof setInterval> | null = null;

function _startPoolMonitoring(): void {
  if (_monitorInterval) return;
  _monitorInterval = setInterval(() => {
    const m = getPoolMetrics();
    if (m.utilization >= POOL_CRITICAL_THRESHOLD) {
      logger.error(
        { event: 'db:pool:critical_utilization', ...m },
        'MongoDB connection pool utilization is critical — risk of exhaustion'
      );
    } else if (m.utilization >= POOL_WARN_THRESHOLD) {
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
  }, MONITOR_INTERVAL_MS);
  _monitorInterval.unref();
}

/** Stops the pool monitoring interval. Safe to call if monitoring is not active. */
export function stopPoolMonitoring(): void {
  if (_monitorInterval) {
    clearInterval(_monitorInterval);
    _monitorInterval = null;
  }
}
