// apps/stellar-service/src/index.ts

import './tracing'; // must be first — initialises OpenTelemetry SDK
import crypto from 'crypto';
import express from 'express';
import { Server } from 'http';
import pinoHttp from 'pino-http';
import {
  fundAccount,
  createIntent,
  verifyIntent,
  getAccountBalance,
  createUsdcTrustline,
  findPaths,
  getOrderbook,
  checkHorizon,
  getFeeStats,
  buildFeeBumpTransaction,
  issueRefund,
  streamAccountTransactions,
} from './stellar.js';
import dotenv from 'dotenv';
import logger from './logger.js';
import { stellarConfig } from './config.js';
import { assertMainnetSafety } from './guards.js';
import { metricsMiddleware, metricsHandler } from './metrics.js';
import {
  parseHorizonError,
  retryWithBackoff,
  checkCircuitBreaker,
  recordSuccess,
  recordFailure,
  getCircuitBreakerState,
} from './error-handler.js';

dotenv.config();

// Run startup validation
assertMainnetSafety();

const app = express();
const PORT = process.env.STELLAR_PORT || 3002;
const SHARED_SECRET = process.env.STELLAR_SERVICE_SECRET;

if (!SHARED_SECRET) {
  logger.error('STELLAR_SERVICE_SECRET required');
  process.exit(1);
}

// Middleware: Validate Shared Secret (ONLY for mutating endpoints)
const requireSecret = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing Authorization header' });
  }

  const token = authHeader.substring(7); // Remove "Bearer "

  if (token !== SHARED_SECRET) {
    return res.status(401).json({ error: 'Invalid secret' });
  }

  return next();
};

// Middleware: Check circuit breaker
const checkCircuitBreakerMiddleware = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (!checkCircuitBreaker()) {
    return res.status(503).json({
      error: 'Stellar network unavailable',
      message: 'Circuit breaker is open due to repeated failures',
      retryable: true,
      suggestedAction: 'Retry after 30 seconds',
    });
  }
  next();
};

app.use(express.json());
app.use(
  pinoHttp({
    logger,
    genReqId: (req) => (req.headers['x-request-id'] as string) ?? crypto.randomUUID(),
    redact: ['req.headers.authorization'],
  })
);
app.use(metricsMiddleware);

// ✅ PUBLIC: GET /metrics — Prometheus metrics
app.get('/metrics', metricsHandler);

// ✅ PUBLIC: GET /network - Network status endpoint
app.get('/network', (_req, res) => {
  return res.json({
    network: stellarConfig.network,
    horizonUrl: stellarConfig.horizonUrl,
    platformPublicKey: stellarConfig.platformPublicKey,
    mainnetMode: stellarConfig.network === 'mainnet',
    dryRun: stellarConfig.dryRun,
  });
});

// ✅ PUBLIC: GET /health - Health check endpoint
app.get('/health', async (req, res) => {
  const horizon = await checkHorizon();
  const status = horizon.status === 'healthy' ? 'ok' : 'degraded';
  const cbState = getCircuitBreakerState();
  
  return res.json({
    status,
    network: stellarConfig.network,
    horizonUrl: stellarConfig.horizonUrl,
    horizonStatus: horizon.status,
    horizonLatency: horizon.latency,
    circuitBreaker: cbState,
    timestamp: new Date().toISOString(),
  });
});

// ✅ PROTECTED: POST /fund (requires secret, testnet only)
app.post('/fund', requireSecret, checkCircuitBreakerMiddleware, async (req, res) => {
  // Return 403 on mainnet - Friendbot is testnet-only
  if (stellarConfig.network === 'mainnet') {
    return res.status(403).json({ 
      error: 'Forbidden', 
      message: 'Friendbot funding is not available on mainnet' 
    });
  }

  try {
    const { publicKey, amount } = req.body;
    const result = await retryWithBackoff(() => fundAccount(publicKey, amount), 3, 1000);
    recordSuccess();
    return res.json({ success: true, ...result });
  } catch (error: any) {
    recordFailure();
    const horizonError = parseHorizonError(error);
    return res.status(horizonError.statusCode).json(horizonError);
  }
});

// ✅ PROTECTED: POST /intent (requires secret)
app.post('/intent', requireSecret, checkCircuitBreakerMiddleware, async (req, res) => {
  try {
    const { fromPublicKey, toPublicKey, amount } = req.body;
    const result = await retryWithBackoff(() => createIntent(fromPublicKey, toPublicKey, amount), 3, 1000);
    recordSuccess();
    return res.json({ success: true, ...result });
  } catch (error: any) {
    recordFailure();
    const horizonError = parseHorizonError(error);
    return res.status(horizonError.statusCode).json(horizonError);
  }
});

// ✅ PROTECTED: POST /refund (requires secret)
app.post('/refund', requireSecret, checkCircuitBreakerMiddleware, async (req, res) => {
  try {
    const { toPublicKey, amount, memo } = req.body;
    if (!toPublicKey || !amount) {
      return res.status(400).json({ error: 'toPublicKey and amount are required' });
    }
    const result = await retryWithBackoff(() => issueRefund(toPublicKey, amount, memo || 'refund'), 3, 1000);
    recordSuccess();
    return res.json({ success: true, ...result });
  } catch (error: any) {
    recordFailure();
    const horizonError = parseHorizonError(error);
    return res.status(horizonError.statusCode).json(horizonError);
  }
});

// ✅ PUBLIC: GET /fee-stats (no auth needed)
app.get('/fee-stats', checkCircuitBreakerMiddleware, async (_req, res) => {
  try {
    const stats = await retryWithBackoff(() => getFeeStats(), 3, 1000);
    recordSuccess();
    res.json({ success: true, ...stats });
  } catch (error: any) {
    recordFailure();
    const horizonError = parseHorizonError(error);
    res.status(horizonError.statusCode).json(horizonError);
  }
});

// ✅ PUBLIC: GET /verify/:hash (no auth needed)
app.get('/verify/:hash', checkCircuitBreakerMiddleware, async (req, res) => {
  try {
    const { hash } = req.params;
    const result = await retryWithBackoff(() => verifyIntent(hash), 3, 1000);
    recordSuccess();
    return res.json({ success: true, ...result });
  } catch (error: any) {
    recordFailure();
    const horizonError = parseHorizonError(error);
    return res.status(horizonError.statusCode).json(horizonError);
  }
});

// ✅ PROTECTED: GET /balance/:publicKey (requires secret)
app.get('/balance/:publicKey', requireSecret, checkCircuitBreakerMiddleware, async (req, res) => {
  try {
    const { publicKey } = req.params;
    const result = await retryWithBackoff(() => getAccountBalance(publicKey), 3, 1000);
    recordSuccess();
    return res.json({ success: true, ...result });
  } catch (error: any) {
    recordFailure();
    const horizonError = parseHorizonError(error);
    return res.status(horizonError.statusCode).json(horizonError);
  }
});

// ✅ PROTECTED: POST /trustline/usdc (requires secret)
app.post('/trustline/usdc', requireSecret, async (req, res) => {
  try {
    const { publicKey, usdcIssuer } = req.body;
    if (!publicKey || !usdcIssuer) {
      return res.status(400).json({ error: 'publicKey and usdcIssuer are required' });
    }
    const result = await createUsdcTrustline(publicKey, usdcIssuer);
    return res.json({ success: true, ...result });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// ✅ PROTECTED: GET /paths (requires secret)
app.get('/paths', requireSecret, async (req, res) => {
  try {
    const { 
      sourceAssetCode, 
      sourceAssetIssuer, 
      destinationAssetCode, 
      destinationAssetIssuer, 
      destinationAmount 
    } = req.query;

    if (!sourceAssetCode || !destinationAssetCode || !destinationAmount) {
      return res.status(400).json({ error: 'Missing required query parameters' });
    }

    const result = await findPaths(
      sourceAssetCode as string,
      sourceAssetIssuer as string,
      destinationAssetCode as string,
      destinationAssetIssuer as string,
      destinationAmount as string
    );
    return res.json({ success: true, data: result });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// ✅ PUBLIC: GET /orderbook (no auth needed)
app.get('/orderbook', async (req, res) => {
  try {
    const { baseAssetCode, baseAssetIssuer, counterAssetCode, counterAssetIssuer } = req.query;

    if (!baseAssetCode || !counterAssetCode) {
      return res.status(400).json({ error: 'Missing required query parameters' });
    }

    const result = await getOrderbook(
      baseAssetCode as string,
      baseAssetIssuer as string,
      counterAssetCode as string,
      counterAssetIssuer as string
    );
    return res.json({ success: true, data: result });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// ✅ PROTECTED: POST /fee-bump — wrap inner XDR in a platform-sponsored fee bump tx
app.post('/fee-bump', requireSecret, async (req, res) => {
  try {
    const { innerXdr } = req.body;
    if (!innerXdr) {
      return res.status(400).json({ error: 'innerXdr is required' });
    }
    const result = await buildFeeBumpTransaction(innerXdr);
    return res.json({ success: true, ...result });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// ✅ PROTECTED: GET /monitor/stream?publicKey=G... — SSE stream of account transactions
app.get('/monitor/stream', requireSecret, (req, res) => {
  const { publicKey } = req.query;

  if (!publicKey || typeof publicKey !== 'string') {
    return res.status(400).json({ error: 'publicKey query parameter is required' });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const close = streamAccountTransactions(
    publicKey,
    (tx) => {
      res.write(`data: ${JSON.stringify(tx)}\n\n`);
    },
    (err) => {
      res.write(`event: error\ndata: ${JSON.stringify({ error: String(err) })}\n\n`);
    }
  );

  req.on('close', () => {
    close();
    logger.info({ publicKey }, 'SSE client disconnected, stream closed');
  });
});

const server: Server = app.listen(PORT, () => {
  logger.info({ 
    port: PORT, 
    network: stellarConfig.network,
    mainnetMode: stellarConfig.network === 'mainnet',
    secret: SHARED_SECRET ? 'SET' : 'MISSING' 
  }, 'Stellar Service running');
});

// Graceful shutdown handler
const shutdown = async (signal: string) => {
  logger.info(`${signal} received, starting graceful shutdown`);

  // Stop accepting new connections
  server.close(() => {
    logger.info('HTTP server closed');
    logger.info('Graceful shutdown completed');
    process.exit(0);
  });

  // Force exit after 30 seconds if graceful shutdown hangs
  setTimeout(() => {
    logger.error('Graceful shutdown timeout (30s), forcing exit');
    process.exit(1);
  }, 30000);
};

// Handle termination signals
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Handle uncaught exceptions
process.on('uncaughtException', (err: unknown) => {
  logger.error({ err }, 'Uncaught exception');
  shutdown('uncaughtException');
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason: unknown) => {
  logger.error({ reason }, 'Unhandled rejection');
  // Log but don't exit - let the process continue
});

export default server;
