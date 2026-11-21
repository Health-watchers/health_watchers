import { Router } from 'express';
import crypto from 'crypto';
import { stellarConfig } from '../config.js';
import logger from '../logger.js';
import { recordSuccess, recordFailure } from '../metrics.js';

const router = Router();

const METRICS_PASSWORD = process.env.METRICS_PASSWORD ?? '';

function requireMetricsAuth(req: any, res: any, next: any) {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    res.setHeader('WWW-Authenticate', 'Basic realm="metrics"');
    return res.status(401).json({ error: 'Missing Authorization header' });
  }

  if (authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    const tokenBuf = Buffer.from(token);
    const expectedBuf = Buffer.from(METRICS_PASSWORD);
    if (tokenBuf.length === expectedBuf.length && crypto.timingSafeEqual(tokenBuf, expectedBuf)) {
      return next();
    }
    return res.status(401).json({ error: 'Invalid metrics credentials' });
  }

  if (authHeader.startsWith('Basic ')) {
    const decoded = Buffer.from(authHeader.substring(6), 'base64').toString('utf8');
    const separatorIndex = decoded.indexOf(':');
    const password = separatorIndex >= 0 ? decoded.substring(separatorIndex + 1) : '';
    const passwordBuf = Buffer.from(password);
    const expectedBuf = Buffer.from(METRICS_PASSWORD);
    if (passwordBuf.length === expectedBuf.length && crypto.timingSafeEqual(passwordBuf, expectedBuf)) {
      return next();
    }
    return res.status(401).json({ error: 'Invalid metrics credentials' });
  }

  return res.status(401).json({ error: 'Unsupported auth scheme' });
}

// GET /metrics — Prometheus metrics endpoint
router.get('/metrics', requireMetricsAuth, async (_req, res) => {
  try {
    const { register } = await import('prom-client');
    const metrics = await register.metrics();
    res.setHeader('Content-Type', 'text/plain');
    return res.send(metrics);
  } catch (error: any) {
    recordFailure();
    return res.status(500).json({ error: error.message });
  }
});

export default router;
