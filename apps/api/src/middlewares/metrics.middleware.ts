/**
 * Express middleware that records HTTP request metrics for Prometheus.
 * Attaches to every request and records duration, size, and status.
 */
import { Request, Response, NextFunction } from 'express';
import {
  httpRequestsTotal,
  httpRequestDurationSeconds,
  httpRequestSizeBytes,
  httpResponseSizeBytes,
  securityHeaderViolationsTotal,
  normalisePath,
} from '../services/metrics.service';

const REQUIRED_SECURITY_HEADERS = [
  'content-security-policy',
  'strict-transport-security',
  'x-content-type-options',
  'x-frame-options',
  'referrer-policy',
] as const;

export function metricsMiddleware(req: Request, res: Response, next: NextFunction): void {
  const start = process.hrtime.bigint();
  const method = req.method;
  const path = normalisePath(req.path);

  // Record request size
  const reqSize = parseInt(req.headers['content-length'] ?? '0', 10) || 0;
  if (reqSize > 0) {
    httpRequestSizeBytes.observe({ method, path }, reqSize);
  }

  res.on('finish', () => {
    const durationNs = process.hrtime.bigint() - start;
    const durationSec = Number(durationNs) / 1e9;
    const status = String(res.statusCode);
    const pathLabel = path;

    httpRequestsTotal.inc({ method, path, status });
    httpRequestDurationSeconds.observe({ method, path }, durationSec);

    if (req.path.startsWith('/api') || req.path.startsWith('/health')) {
      for (const header of REQUIRED_SECURITY_HEADERS) {
        if (!res.getHeader(header)) {
          securityHeaderViolationsTotal.inc({ header, path: pathLabel });
        }
      }
    }

    const resSize = parseInt(res.getHeader('content-length') as string ?? '0', 10) || 0;
    if (resSize > 0) {
      httpResponseSizeBytes.observe({ method, path }, resSize);
    }
  });

  next();
}
