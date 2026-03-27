import mongoose from 'mongoose';
import { config } from '@health-watchers/config';

export async function connectDB(): Promise<void> {
  if (!config.mongoUri) {
    console.error('❌ MONGO_URI is not set');
    process.exit(1);
  }
  await mongoose.connect(config.mongoUri);
  console.log('✅ MongoDB Connected');
}
