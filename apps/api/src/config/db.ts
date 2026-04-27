import mongoose from 'mongoose';
import { config } from '@health-watchers/config';
import logger from '../utils/logger';

const MAX_RETRIES = 5;
const BASE_DELAY_MS = 1_000;

const POOL_OPTIONS = {
  maxPoolSize: 10,
  minPoolSize: 2,
  serverSelectionTimeoutMS: 5_000,
  socketTimeoutMS: 45_000,
  connectTimeoutMS: 10_000,
  heartbeatFrequencyMS: 10_000,
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
  const states = ['disconnected', 'connected', 'connecting', 'disconnecting'] as const;
  return states[mongoose.connection.readyState] ?? 'disconnected';
}
