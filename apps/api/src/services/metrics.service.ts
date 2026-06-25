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

export const paymentSuccessRate = new client.Gauge({
  name: 'payment_success_rate',
  help: 'Payment success rate (0-1)',
  labelNames: ['clinicId'] as const,
  registers: [register],
});

export const encounterDurationSeconds = new client.Histogram({
  name: 'encounter_duration_seconds',
  help: 'Encounter duration in seconds',
  labelNames: ['clinicId'] as const,
  buckets: [60, 300, 600, 1800, 3600, 7200, 14400],
  registers: [register],
});

export const activeUsersTotal = new client.Gauge({
  name: 'active_users_total',
  help: 'Total number of active users',
  labelNames: ['clinicId'] as const,
  registers: [register],
});

export const apiKeyRequestsTotal = new client.Counter({
  name: 'api_key_requests_total',
  help: 'Total API requests by API key and endpoint',
  labelNames: ['apiKeyId', 'endpoint'] as const,
  registers: [register],
});

export const stellarTransactionFeeXlm = new client.Histogram({
  name: 'stellar_transaction_fee_xlm',
  help: 'Stellar transaction fee in XLM',
  labelNames: ['clinicId', 'transactionType'] as const,
  buckets: [0.00001, 0.0001, 0.001, 0.01, 0.1, 1, 10],
  registers: [register],
});

export const aiRequestsTotal = new client.Counter({
  name: 'ai_requests_total',
  help: 'Total number of AI endpoint requests',
  labelNames: ['endpoint'] as const,
  registers: [register],
});

export const securityHeaderViolationsTotal = new client.Counter({
  name: 'security_header_violations_total',
  help: 'Total number of responses missing required security headers',
  labelNames: ['header', 'path'] as const,
  registers: [register],
});

// ── Payment Expiration Job Metrics ────────────────────────────────────────────

export const paymentExpirationJobErrorsTotal = new client.Counter({
  name: 'payment_expiration_job_errors_total',
  help: 'Total number of payment expiration job execution failures',
  registers: [register],
});

export const paymentExpirationJobLastRunExpired = new client.Gauge({
  name: 'payment_expiration_job_last_run_expired',
  help: 'Number of payments expired in the most recent successful job run',
  registers: [register],
});

export const paymentExpirationJobLastSuccessTimestamp = new client.Gauge({
  name: 'payment_expiration_job_last_success_timestamp_seconds',
  help: 'Unix timestamp (seconds) of the last successful payment expiration job run',
  registers: [register],
});

export const paymentExpirationJobConsecutiveFailures = new client.Gauge({
  name: 'payment_expiration_job_consecutive_failures',
  help: 'Number of consecutive payment expiration job failures since last success',
  registers: [register],
});

// ── XLM Exchange Rate Job Metrics ─────────────────────────────────────────────

export const xlmRateFetchErrorsTotal = new client.Counter({
  name: 'xlm_rate_fetch_errors_total',
  help: 'Total number of XLM/USD exchange rate fetch failures',
  registers: [register],
});

export const xlmRateLastValueUsd = new client.Gauge({
  name: 'xlm_rate_last_value_usd',
  help: 'Most recently fetched XLM/USD exchange rate',
  registers: [register],
});

export const xlmRateLastFetchTimestamp = new client.Gauge({
  name: 'xlm_rate_last_fetch_timestamp_seconds',
  help: 'Unix timestamp (seconds) of the last successful XLM/USD rate fetch',
  registers: [register],
});

export const xlmRateStale = new client.Gauge({
  name: 'xlm_rate_stale',
  help: 'Whether the cached XLM/USD rate is older than the staleness threshold (1 = stale, 0 = fresh)',
  registers: [register],
});

// ── System Metrics ────────────────────────────────────────────────────────────

export const mongodbConnectionPoolSize = new client.Gauge({
  name: 'mongodb_connection_pool_size',
  help: 'MongoDB connection pool size',
  registers: [register],
});

export const mongodbPoolWaitQueueSize = new client.Gauge({
  name: 'mongodb_pool_wait_queue_size',
  help: 'Number of operations waiting for a MongoDB connection from the pool',
  registers: [register],
});

export const mongodbKeyDecryptionFailures = new client.Counter({
  name: 'mongodb_keypair_decryption_failures_total',
  help: 'Total number of Stellar keypair decryption failures',
  registers: [register],
});

// ── Subscription Metrics ──────────────────────────────────────────────────────

export const subscriptionLimitViolations = new client.Counter({
  name: 'subscription_limit_violations_total',
  help: 'Total number of subscription limit violations by tier and resource',
  labelNames: ['tier', 'resource'] as const,
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
