// apps/stellar-service/src/index.ts

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
} from './stellar.js';
import dotenv from 'dotenv';
import logger from './logger.js';
import { stellarConfig } from './config.js';
import { assertMainnetSafety } from './guards.js';

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

app.use(express.json());
app.use(
  pinoHttp({
    logger,
    genReqId: (req) => (req.headers['x-request-id'] as string) ?? crypto.randomUUID(),
    redact: ['req.headers.authorization'],
  })
);

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

// ✅ PROTECTED: POST /fund (requires secret, testnet only)
app.post('/fund', requireSecret, async (req, res) => {
  // Return 403 on mainnet - Friendbot is testnet-only
  if (stellarConfig.network === 'mainnet') {
    return res.status(403).json({ 
      error: 'Forbidden', 
      message: 'Friendbot funding is not available on mainnet' 
    });
  }

  try {
    const { publicKey, amount } = req.body;
    const result = await fundAccount(publicKey, amount);
    return res.json({ success: true, ...result });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// ✅ PROTECTED: POST /intent (requires secret)
app.post('/intent', requireSecret, async (req, res) => {
  try {
    const { fromPublicKey, toPublicKey, amount } = req.body;
    const result = await createIntent(fromPublicKey, toPublicKey, amount);
    return res.json({ success: true, ...result });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// ✅ PUBLIC: GET /verify/:hash (no auth needed)
app.get('/verify/:hash', async (req, res) => {
  try {
    const { hash } = req.params;
    const result = await verifyIntent(hash);
    return res.json({ success: true, ...result });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// ✅ PROTECTED: GET /balance/:publicKey (requires secret)
app.get('/balance/:publicKey', requireSecret, async (req, res) => {
  try {
    const { publicKey } = req.params;
    const result = await getAccountBalance(publicKey);
    return res.json({ success: true, ...result });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
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
