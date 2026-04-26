/**
 * Prometheus metrics service using prom-client.
 * Exposes HTTP metrics, business metrics, and default Node.js metrics.
 */
import client from 'prom-client';

// ── Registry ──────────────────────────────────────────────────────────────────
export const register = new client.Registry();

// Collect default Node.js metrics (heap, GC, event loop lag, etc.)
client.collectDefaultMetrics({ register, prefix: 'nodejs_' });

// ── HTTP Metrics ──────────────────────────────────────────────────────────────

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

export const httpRequestSizeBytes = new client.Histogram({
  name: 'http_request_size_bytes',
  help: 'HTTP request size in bytes',
  labelNames: ['method', 'path'] as const,
  buckets: [100, 1000, 5000, 10000, 50000, 100000, 500000],
  registers: [register],
});

export const httpResponseSizeBytes = new client.Histogram({
  name: 'http_response_size_bytes',
  help: 'HTTP response size in bytes',
  labelNames: ['method', 'path'] as const,
  buckets: [100, 1000, 5000, 10000, 50000, 100000, 500000],
  registers: [register],
});

// ── Business Metrics ──────────────────────────────────────────────────────────

export const patientsCreatedTotal = new client.Counter({
  name: 'patients_created_total',
  help: 'Total number of patients created',
  labelNames: ['clinicId'] as const,
  registers: [register],
});

export const encountersCreatedTotal = new client.Counter({
  name: 'encounters_created_total',
  help: 'Total number of encounters created',
  labelNames: ['clinicId'] as const,
  registers: [register],
});

export const paymentsInitiatedTotal = new client.Counter({
  name: 'payments_initiated_total',
  help: 'Total number of payments initiated',
  labelNames: ['currency'] as const,
  registers: [register],
});

export const paymentsConfirmedTotal = new client.Counter({
  name: 'payments_confirmed_total',
  help: 'Total number of payments confirmed',
  labelNames: ['currency'] as const,
  registers: [register],
});

export const aiRequestsTotal = new client.Counter({
  name: 'ai_requests_total',
  help: 'Total number of AI endpoint requests',
  labelNames: ['endpoint'] as const,
  registers: [register],
});

// ── System Metrics ────────────────────────────────────────────────────────────

export const mongodbConnectionPoolSize = new client.Gauge({
  name: 'mongodb_connection_pool_size',
  help: 'MongoDB connection pool size',
  registers: [register],
});

// ── Normalise path helper ─────────────────────────────────────────────────────
// Replace dynamic segments (ObjectIds, UUIDs, numbers) with placeholders
// to avoid high-cardinality label explosion.
export function normalisePath(path: string): string {
  return path
    .replace(/\/[a-f0-9]{24}/gi, '/:id')          // MongoDB ObjectIds
    .replace(/\/[0-9a-f-]{36}/gi, '/:uuid')        // UUIDs
    .replace(/\/\d+/g, '/:n')                      // plain numbers
    .replace(/\?.*$/, '');                          // strip query string
}
