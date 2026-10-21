/**
 * Prometheus metrics for the stellar-service.
 * Exposes HTTP metrics and default Node.js metrics.
 */
import client from 'prom-client';
import { Request, Response, NextFunction } from 'express';

export const register = new client.Registry();

client.collectDefaultMetrics({ register, prefix: 'nodejs_' });

export const httpRequestsTotal = new client.Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'path', 'status'] as const,
  registers: [register],
});

export const httpRequestDurationSeconds = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'path'] as const,
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [register],
});

export const stellarTransactionsTotal = new client.Counter({
  name: 'stellar_transactions_total',
  help: 'Total number of Stellar transactions processed',
  labelNames: ['type', 'status'] as const,
  registers: [register],
});

export const stellarPaymentQueueDepth = new client.Gauge({
  name: 'stellar_payment_queue_depth',
  help: 'Current number of payments waiting to be processed',
  registers: [register],
});

export const stellarConfirmedPaymentsTotal = new client.Counter({
  name: 'stellar_confirmed_payments_total',
  help: 'Total number of Stellar payments auto-confirmed by the Horizon stream',
  registers: [register],
});

export const stellarStreamHealth = new client.Gauge({
  name: 'stellar_stream_health',
  help: '1 when the Stellar payment stream is active, 0 when disconnected',
  registers: [register],
});

// ---------------------------------------------------------------------------
// Batch payment metrics
// ---------------------------------------------------------------------------

export const stellarBatchSubmittedTotal = new client.Counter({
  name: 'stellar_batch_submitted_total',
  help: 'Total number of Stellar payment batches submitted for processing',
  labelNames: ['status'] as const,
  registers: [register],
});

export const stellarBatchPaymentsTotal = new client.Counter({
  name: 'stellar_batch_payments_total',
  help: 'Total number of individual payments processed within batches',
  labelNames: ['status'] as const,
  registers: [register],
});

export const stellarBatchPaymentsPerBatch = new client.Histogram({
  name: 'stellar_batch_payments_per_batch',
  help: 'Number of payments contained in each processed batch',
  buckets: [1, 5, 10, 25, 50, 100, 250, 500, 1000],
  registers: [register],
});

export const stellarBatchFailuresTotal = new client.Counter({
  name: 'stellar_batch_failures_total',
  help: 'Total number of batch payment failures, labelled by reason',
  labelNames: ['reason'] as const,
  registers: [register],
});

export const stellarBatchPaymentRetriesTotal = new client.Counter({
  name: 'stellar_batch_payment_retries_total',
  help: 'Total number of retry attempts for failed payments within batches',
  labelNames: ['reason'] as const,
  registers: [register],
});

export const stellarBatchDurationSeconds = new client.Histogram({
  name: 'stellar_batch_duration_seconds',
  help: 'Wall-clock duration of batch processing in seconds',
  labelNames: ['status'] as const,
  buckets: [0.1, 0.5, 1, 2.5, 5, 10, 30, 60, 120, 300],
  registers: [register],
});

export const stellarBatchFailureRate = new client.Gauge({
  name: 'stellar_batch_failure_rate',
  help: 'Ratio of failed payments to total payments processed in batches (0-1)',
  registers: [register],
});

function normalisePath(path: string): string {
  return path
    .replace(/\/[A-Z0-9]{56}/gi, '/:publicKey') // Stellar public keys
    .replace(/\/[a-f0-9]{64}/gi, '/:hash') // transaction hashes
    .replace(/\?.*$/, '');
}

export function metricsMiddleware(req: Request, res: Response, next: NextFunction): void {
  const start = process.hrtime.bigint();
  const method = req.method;
  const path = normalisePath(req.path);

  res.on('finish', () => {
    const durationSec = Number(process.hrtime.bigint() - start) / 1e9;
    const status = String(res.statusCode);
    httpRequestsTotal.inc({ method, path, status });
    httpRequestDurationSeconds.observe({ method, path }, durationSec);
  });

  next();
}

export async function metricsHandler(_req: Request, res: Response): Promise<void> {
  const isProd = process.env.NODE_ENV === 'production';
  if (isProd) {
    const user = process.env.METRICS_USERNAME;
    const pass = process.env.METRICS_PASSWORD;
    if (user && pass) {
      const authHeader = _req.headers.authorization ?? '';
      if (!authHeader.startsWith('Basic ')) {
        res.set('WWW-Authenticate', 'Basic realm="metrics"');
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }
      const decoded = Buffer.from(authHeader.split(' ')[1], 'base64').toString('utf8');
      const [u, p] = decoded.split(':');
      if (u !== user || p !== pass) {
        res.set('WWW-Authenticate', 'Basic realm="metrics"');
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }
    }
  }
  const metrics = await register.metrics();
  res.set('Content-Type', register.contentType);
  res.send(metrics);
}
