// apps/stellar-service/src/index.ts

import crypto from 'crypto';
import express from 'express';
import { Server } from 'http';
import pinoHttp from 'pino-http';
import { fundAccount, createIntent, verifyIntent, getAccountBalance, createUsdcTrustline } from './stellar.js';
import dotenv from 'dotenv';
import logger from './logger.js';

dotenv.config();

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
  
  next();
};

app.use(express.json());
app.use(pinoHttp({
  logger,
  genReqId: (req) => (req.headers['x-request-id'] as string) ?? crypto.randomUUID(),
  redact: ['req.headers.authorization'],
}));

// ✅ PROTECTED: POST /fund (requires secret)
app.post('/fund', requireSecret, async (req, res) => {
  try {
    const { publicKey, amount } = req.body;
    const result = await fundAccount(publicKey, amount);
    res.json({ success: true, ...result });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ✅ PROTECTED: POST /intent (requires secret)
app.post('/intent', requireSecret, async (req, res) => {
  try {
    const { fromPublicKey, toPublicKey, amount } = req.body;
    const result = await createIntent(fromPublicKey, toPublicKey, amount);
    res.json({ success: true, ...result });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ✅ PUBLIC: GET /verify/:hash (no auth needed)
app.get('/verify/:hash', async (req, res) => {
  try {
    const { hash } = req.params;
    const result = await verifyIntent(hash);
    res.json({ success: true, ...result });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ✅ PROTECTED: GET /balance/:publicKey (requires secret)
app.get('/balance/:publicKey', requireSecret, async (req, res) => {
  try {
    const { publicKey } = req.params;
    const result = await getAccountBalance(publicKey);
    res.json({ success: true, ...result });
  } catch (error) {
    res.status(500).json({ error: error.message });
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
    res.json({ success: true, ...result });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

const server: Server = app.listen(PORT, () => {
  logger.info({ port: PORT, secret: SHARED_SECRET ? 'SET' : 'MISSING' }, 'Stellar Service running');
});

export default server;
