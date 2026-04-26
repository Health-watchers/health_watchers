/**
 * GET /metrics — Prometheus text-format metrics endpoint.
 *
 * Protected by HTTP Basic Auth using METRICS_USERNAME / METRICS_PASSWORD env vars.
 * Falls back to IP allowlist (METRICS_ALLOWED_IPS) if basic auth is not configured.
 * If neither is configured the endpoint is disabled in production and open in dev.
 */
import { Router, Request, Response } from 'express';
import { register } from '../../services/metrics.service';
import logger from '../../utils/logger';

const router = Router();

// ── Auth helpers ──────────────────────────────────────────────────────────────

function basicAuthGuard(req: Request, res: Response): boolean {
  const user = process.env.METRICS_USERNAME;
  const pass = process.env.METRICS_PASSWORD;
  if (!user || !pass) return true; // not configured — skip this guard

  const authHeader = req.headers.authorization ?? '';
  if (!authHeader.startsWith('Basic ')) {
    res.set('WWW-Authenticate', 'Basic realm="metrics"');
    res.status(401).json({ error: 'Unauthorized', message: 'Basic auth required for /metrics' });
    return false;
  }

  const [, encoded] = authHeader.split(' ');
  const decoded = Buffer.from(encoded, 'base64').toString('utf8');
  const [reqUser, reqPass] = decoded.split(':');

  if (reqUser !== user || reqPass !== pass) {
    res.set('WWW-Authenticate', 'Basic realm="metrics"');
    res.status(401).json({ error: 'Unauthorized', message: 'Invalid credentials' });
    return false;
  }
  return true;
}

function ipAllowlistGuard(req: Request, res: Response): boolean {
  const allowedIps = process.env.METRICS_ALLOWED_IPS;
  if (!allowedIps) return true; // not configured — skip this guard

  const allowed = allowedIps.split(',').map((ip) => ip.trim()).filter(Boolean);
  const clientIp =
    (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ??
    req.socket.remoteAddress ??
    '';

  if (!allowed.includes(clientIp)) {
    logger.warn({ clientIp }, '[metrics] access denied — IP not in allowlist');
    res.status(403).json({ error: 'Forbidden', message: 'Access to /metrics is restricted' });
    return false;
  }
  return true;
}

// ── GET /metrics ──────────────────────────────────────────────────────────────
router.get('/', async (req: Request, res: Response) => {
  const isProd = process.env.NODE_ENV === 'production';

  // In production, require at least one protection mechanism
  if (isProd) {
    const hasBasicAuth = !!(process.env.METRICS_USERNAME && process.env.METRICS_PASSWORD);
    const hasIpAllowlist = !!process.env.METRICS_ALLOWED_IPS;

    if (!hasBasicAuth && !hasIpAllowlist) {
      return res.status(503).json({
        error: 'MetricsDisabled',
        message:
          'Metrics endpoint requires METRICS_USERNAME/METRICS_PASSWORD or METRICS_ALLOWED_IPS in production.',
      });
    }
  }

  if (!basicAuthGuard(req, res)) return;
  if (!ipAllowlistGuard(req, res)) return;

  try {
    const metrics = await register.metrics();
    res.set('Content-Type', register.contentType);
    return res.send(metrics);
  } catch (err) {
    logger.error({ err }, '[metrics] failed to collect metrics');
    return res.status(500).json({ error: 'InternalServerError', message: 'Failed to collect metrics' });
  }
});

export default router;
