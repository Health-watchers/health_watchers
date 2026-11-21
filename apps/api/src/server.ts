import http from 'http';
import mongoose from 'mongoose';
import { app } from './app';
import { connectDB } from './config/database';
import { logger } from './config/logger';
import { seedBuiltInRules } from './services/ruleSeedService';
import { startJobs, stopJobs } from './jobs';

const PORT = Number(process.env.PORT) || 3000;

let server: http.Server | null = null;
let poolMetricsInterval: NodeJS.Timeout | null = null;

function startPoolMetrics(): void {
  if (poolMetricsInterval) {
    return;
  }

  poolMetricsInterval = setInterval(() => {
    try {
      const connections = mongoose.connections;
      for (const connection of connections) {
        const pool = (connection as unknown as { db?: { serverConfig?: unknown } }).db;
        if (!pool) {
          continue;
        }
        logger.debug(
          {
            service: 'api',
            requestId: 'system',
            readyState: connection.readyState,
            name: connection.name,
            message: 'MongoDB connection pool metrics',
          },
          'MongoDB connection pool metrics',
        );
      }
    } catch (err) {
      logger.warn(
        {
          service: 'api',
          requestId: 'system',
          err,
          message: 'Failed to collect MongoDB pool metrics',
        },
        'Failed to collect MongoDB pool metrics',
      );
    }
  }, 15_000);

  // Do not keep the event loop alive solely for metrics.
  if (typeof poolMetricsInterval.unref === 'function') {
    poolMetricsInterval.unref();
  }
}

function stopPoolMetrics(): void {
  if (poolMetricsInterval) {
    clearInterval(poolMetricsInterval);
    poolMetricsInterval = null;
  }
}

async function startServer(): Promise<void> {
  await connectDB();
  await seedBuiltInRules();

  startJobs();
  startPoolMetrics();

  await new Promise<void>((resolve, reject) => {
    server = app.listen(PORT, () => {
      logger.info(
        {
          service: 'api',
          requestId: 'system',
          port: PORT,
          message: 'API server listening',
        },
        'API server listening',
      );
      resolve();
    });
    server.on('error', reject);
  });
}

async function shutdown(signal: string): Promise<void> {
  logger.info(
    {
      service: 'api',
      requestId: 'system',
      signal,
      message: 'Shutting down API server',
    },
    'Shutting down API server',
  );

  stopPoolMetrics();

  try {
    await stopJobs();
  } catch (err) {
    logger.error(
      {
        service: 'api',
        requestId: 'system',
        err,
        message: 'Error stopping jobs during shutdown',
      },
      'Error stopping jobs during shutdown',
    );
  }

  if (server) {
    await new Promise<void>((resolve) => {
      server!.close(() => resolve());
    });
    server = null;
  }

  try {
    await mongoose.disconnect();
  } catch (err) {
    logger.error(
      {
        service: 'api',
        requestId: 'system',
        err,
        message: 'Error disconnecting from MongoDB during shutdown',
      },
      'Error disconnecting from MongoDB during shutdown',
    );
  }
}

function registerShutdownHandlers(): void {
  const handleSignal = (signal: string) => {
    shutdown(signal)
      .then(() => {
        process.exit(0);
      })
      .catch((err) => {
        logger.fatal(
          {
            service: 'api',
            requestId: 'system',
            err,
            message: 'Fatal error during shutdown',
          },
          'Fatal error during shutdown',
        );
        process.exit(1);
      });
  };

  process.once('SIGTERM', () => handleSignal('SIGTERM'));
  process.once('SIGINT', () => handleSignal('SIGINT'));
}

registerShutdownHandlers();

startServer().catch((err) => {
  logger.fatal(
    {
      service: 'api',
      requestId: 'system',
      err,
      message: 'Fatal error during API server startup',
    },
    'Fatal error during API server startup',
  );
  process.exit(1);
});