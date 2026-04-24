import mongoose from 'mongoose';
import { config } from '@health-watchers/config';
import logger from '../utils/logger';

export async function connectDB(): Promise<void> {
  if (!config.mongoUri) {
    logger.error('MONGO_URI is not set');
    process.exit(1);
  }
  await mongoose.connect(config.mongoUri);
  logger.info('MongoDB connected');
}
