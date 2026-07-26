import { Server, IncomingMessage, ServerResponse } from 'http';
import { Socket } from 'net';
import mongoose from 'mongoose';
import logger from './logger';

/**
 * Attaches connection tracking to an HTTP server so that keep-alive connections
 * can be forcibly closed during shutdown, allowing in-flight requests to drain.
 */
export function trackConnections(server: Server): () => void {
  const connections = new Set<Socket>();

  server.on('connection', (socket: Socket) => {
    connections.add(socket);
    socket.once('close', () => connections.delete(socket));
  });

  // Mark each socket as idle once its response finishes so we can destroy it during drain
  server.on('request', (req: IncomingMessage, res: ServerResponse) => {
    const socket = req.socket as Socket & { _isIdle?: boolean };
    socket._isIdle = false;
    res.once('finish', () => {
      socket._isIdle = true;
    });
  });

  return function destroyIdleConnections() {
    for (const socket of connections) {
      const s = socket as Socket & { _isIdle?: boolean };
      if (s._isIdle !== false) {
        socket.destroy();
        connections.delete(socket);
      }
    }
  };
}

export interface ShutdownDeps {
  stopJobs: (() => void)[];
  timeoutMs?: number;
}

/**
 * Registers SIGTERM / SIGINT / uncaughtException handlers.
 * On signal: stops accepting connections, drains in-flight requests, closes the DB.
 */
export function registerGracefulShutdown(server: Server, deps: ShutdownDeps): void {
  const { stopJobs, timeoutMs = 30_000 } = deps;
  const destroyIdle = trackConnections(server);

  const shutdown = async (signal: string) => {
    logger.info(`${signal} received — starting graceful shutdown`);

    // Stop accepting new connections and drain pending requests
    server.close(async () => {
      logger.info('HTTP server closed — all in-flight requests completed');

      try {
        for (const stop of stopJobs) stop();
        logger.info('Background jobs stopped');

        await mongoose.connection.close();
        logger.info('MongoDB connection closed');

        logger.info('Graceful shutdown complete');
        process.exit(0);
      } catch (err) {
        logger.error({ err }, 'Error during graceful shutdown');
        process.exit(1);
      }
    });

    // Destroy idle keep-alive connections so server.close() callback fires promptly
    destroyIdle();

    // Force exit if drain takes too long
    setTimeout(() => {
      logger.error(`Graceful shutdown timeout (${timeoutMs}ms) — forcing exit`);
      process.exit(1);
    }, timeoutMs).unref();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('uncaughtException', (err) => {
    logger.error({ err }, 'Uncaught exception');
    shutdown('uncaughtException');
  });
  process.on('unhandledRejection', (reason) => {
    logger.error({ reason }, 'Unhandled rejection');
  });
}
