// apps/stellar-service/src/index.ts

import express from 'express';
import { Server } from 'http';
import { fundAccount, createIntent, verifyIntent } from './stellar.js'; // your existing imports
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.STELLAR_PORT || 3002;
const SHARED_SECRET = process.env.STELLAR_SERVICE_SECRET;

if (!SHARED_SECRET) {
  console.error('❌ STELLAR_SERVICE_SECRET required!');
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

const server: Server = app.listen(PORT, () => {
  console.log(`🚀 Stellar Service running on port ${PORT}`);
  console.log(`🔒 Protected by secret: ${SHARED_SECRET ? 'SET' : 'MISSING'}`);
});

export default server;
