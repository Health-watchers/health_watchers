/**
 * Application Performance Monitoring (APM) bootstrap.
 *
 * Wires up request-duration and error-rate metrics consumed by
 * `apps/api/monitoring/app-alerts.yml`, plus uptime tracking. Intended to
 * be imported once at process start, before the HTTP server begins
 * accepting traffic.
 */

import { Counter, Histogram, Registry } from 'prom-client';

export const apmRegistry = new Registry();

export const httpRequestsTotal = new Counter({
  name: 'http_requests_total',
  help: 'Total HTTP requests processed, labeled by route/method/status',
  labelNames: ['method', 'route', 'status'] as const,
  registers: [apmRegistry],
});

export const httpRequestDurationSeconds = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'route', 'status'] as const,
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10],
  registers: [apmRegistry],
});

export const deploymentHealthGauge = new Counter({
  name: 'deployment_verification_checks_total',
  help: 'Count of deployment health verification checks, labeled by outcome',
  labelNames: ['service', 'outcome'] as const,
  registers: [apmRegistry],
});

/**
 * Express/Fastify-agnostic middleware factory: records request count and
 * latency for every response. Wire into the HTTP framework's middleware
 * chain at app bootstrap.
 */
export function apmMiddleware() {
  return (req: any, res: any, next: () => void) => {
    const start = process.hrtime.bigint();
    const route = req.route?.path || req.path || 'unknown';

    res.on('finish', () => {
      const durationNs = process.hrtime.bigint() - start;
      const durationSeconds = Number(durationNs) / 1e9;
      const labels = {
        method: req.method,
        route,
        status: String(res.statusCode),
      };
      httpRequestsTotal.inc(labels);
      httpRequestDurationSeconds.observe(labels, durationSeconds);
    });

    next();
  };
}

export function recordDeploymentCheck(service: string, outcome: 'healthy' | 'unhealthy' | 'rolled_back') {
  deploymentHealthGauge.inc({ service, outcome });
}

export async function apmMetricsHandler(_req: unknown, res: { set: (h: string, v: string) => void; send: (body: string) => void }) {
  res.set('Content-Type', apmRegistry.contentType);
  res.send(await apmRegistry.metrics());
}
