import mongoose from 'mongoose';
import { config } from '@health-watchers/config';

/**
 * Connect to MongoDB with explicit connection-pool options.
 * Safe to call multiple times — skips if already connected.
 */
export async function connectDB(): Promise<void> {
  if (mongoose.connection.readyState !== 0) return; // already connected / connecting

  await mongoose.connect(config.mongoUri, {
    maxPoolSize:              config.mongoMaxPool, // configurable via MONGO_MAX_POOL_SIZE
    minPoolSize:              2,
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS:          45000,
  });
}

/**
 * Returns a short string describing the current Mongoose connection state.
 */
export function dbState(): 'connected' | 'disconnected' | 'connecting' | 'disconnecting' {
  const states: Record<number, 'connected' | 'disconnected' | 'connecting' | 'disconnecting'> = {
    0: 'disconnected',
    1: 'connected',
    2: 'connecting',
    3: 'disconnecting',
  };
  return states[mongoose.connection.readyState] ?? 'disconnected';
}
