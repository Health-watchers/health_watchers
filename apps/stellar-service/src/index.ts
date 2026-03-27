import express from 'express';
import pino from 'pino';

const isDev = process.env.NODE_ENV !== 'production';
const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  ...(isDev ? { transport: { target: 'pino-pretty', options: { colorize: true } } } : {}),
});

const app = express();
const PORT = process.env.STELLAR_SERVICE_PORT ?? 3002;
const SHUTDOWN_TIMEOUT_MS = Number(process.env.SHUTDOWN_TIMEOUT_MS ?? 10000);

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

const server = app.listen(PORT, () => {
  logger.info(`stellar-service running on port ${PORT}`);
});

function shutdown(signal: string) {
  logger.info({ signal }, 'Shutting down gracefully...');
  server.close(() => {
    logger.info('HTTP server closed');
    process.exit(0);
  });

  setTimeout(() => {
    logger.error('Shutdown timeout exceeded — forcing exit');
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));
