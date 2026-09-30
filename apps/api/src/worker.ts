import './tracing'; // must be first — initialises OpenTelemetry SDK before any other import
import './instrument'; // must be first — initialises Sentry before any other module
import './config/env'; // must be second — validates env vars

import mongoose from 'mongoose';
import { connectDB } from './config/db';
import { startJobScheduler, stopJobScheduler, JOB_DEFINITIONS } from './jobs';
import logger from './utils/logger';

/**
 * Worker Entry Point
 *
 * This process runs background jobs separately from the HTTP API server,
 * allowing independent scaling based on queue depth and job load.
 *
 * Jobs are BullMQ job schedulers registered in `./jobs` (#1433). Running any
 * number of worker and API replicas still executes each job once per tick.
 * Set `JOBS_ENABLED=false` on API pods to leave job execution to this process.
 */

async function startWorker(): Promise<void> {
  try {
    logger.info('🔧 Starting Health Watchers Worker...');

    await connectDB();
    logger.info('✅ Database connected');

    await startJobScheduler();
    logger.info({ jobs: JOB_DEFINITIONS.map((j) => j.name) }, '✅ Job scheduler started');

    const shutdown = async (signal: string): Promise<void> => {
      logger.info(`${signal} received — stopping job scheduler`);
      try {
        await stopJobScheduler();
        await mongoose.connection.close();
        logger.info('✅ Worker stopped gracefully');
        process.exit(0);
      } catch (err) {
        logger.error({ err }, 'Error during worker shutdown');
        process.exit(1);
      }
    };
    process.once('SIGTERM', () => void shutdown('SIGTERM'));
    process.once('SIGINT', () => void shutdown('SIGINT'));

    logger.info('✅ Worker is running and processing jobs');
  } catch (error) {
    logger.error({ err: error }, '❌ Failed to start worker');
    process.exit(1);
  }
}

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  logger.error({ reason, promise }, 'Unhandled Rejection at Promise');
  process.exit(1);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error({ err: error }, 'Uncaught Exception thrown');
  process.exit(1);
});

// Start the worker
startWorker().catch((error) => {
  logger.error({ err: error }, 'Fatal error during worker startup');
  process.exit(1);
});
