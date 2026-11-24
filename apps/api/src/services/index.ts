/**
 * @module services
 * @description Shared Services — Barrel Exports
 *
 * Single entry point for all cross-cutting services in the API.
 * **Always import from this barrel** — never import from individual
 * service files directly. This keeps internal paths stable and lets us
 * rename or split services without touching consumers.
 *
 * Issue #1061 — Service Layer Refactor
 *
 * Organised by responsibility:
 *
 * ┌──────────────────────────┬──────────────────────────────────────────────┐
 * │ Service                  │ Responsibility                               │
 * ├──────────────────────────┼──────────────────────────────────────────────┤
 * │ cache                    │ Redis-backed get/set/del with TTL support    │
 * │ token-denylist           │ JWT revocation via Redis denylist            │
 * │ metrics (Prometheus)     │ HTTP, patient, payment, AI, Stellar gauges   │
 * │ business-metrics         │ Domain-level KPIs (payments, encounters)     │
 * │ backup-metrics           │ Backup-verification Prometheus metrics       │
 * │ SocketService            │ Socket.IO real-time event broadcasting       │
 * └──────────────────────────┴──────────────────────────────────────────────┘
 *
 * See SERVICE_LAYER_GUIDE.md in this directory for full documentation.
 *
 * @example
 *   import { cache, httpRequestsTotal, SocketService } from '@api/services';
 */

// ── Cache ─────────────────────────────────────────────────────────────────────
/**
 * Redis-backed cache client.
 * Degrades gracefully when Redis is unavailable — reads return null,
 * writes are no-ops. Never throws to callers.
 */
export { cache, getCacheMetrics } from './cache.service';

// ── Token Denylist ────────────────────────────────────────────────────────────
/**
 * JWT revocation helpers.
 * Stores revoked JTIs in Redis with a TTL matching the token's remaining
 * lifetime so the denylist never grows unbounded.
 */
export {
  addToDenylist,
  isDenylisted,
  setUserInvalidatedAt,
  isInvalidatedForUser,
} from './token-denylist.service';

// ── Prometheus Metrics ────────────────────────────────────────────────────────
/**
 * Pre-registered Prometheus metrics.
 * Do NOT create your own Counter/Histogram/Gauge instances — import
 * the shared ones from here to avoid duplicate metric registration errors.
 *
 * Groups:
 *  - HTTP request/response metrics
 *  - Domain counters (patients, encounters, payments)
 *  - Stellar / XLM fee tracking
 *  - AI request counters
 *  - MongoDB connection pool metrics
 *  - Security header violation counters
 *  - Rate-limit hit counters
 *  - Subscription limit violation counters
 */
export {
  // Prometheus registry
  register,

  // HTTP metrics
  normalisePath,
  httpRequestsTotal,
  httpRequestDurationSeconds,
  httpRequestSizeBytes,
  httpResponseSizeBytes,

  // Domain counters
  patientsCreatedTotal,
  encountersCreatedTotal,
  paymentsInitiatedTotal,
  paymentsConfirmedTotal,
  paymentSuccessRate,
  encounterDurationSeconds,
  activeUsersTotal,
  apiKeyRequestsTotal,

  // Stellar / XLM metrics
  stellarTransactionFeeXlm,
  feeStrategySelectedTotal,
  feeAmountPaidXlm,
  xlmRateFetchErrorsTotal,
  xlmRateLastValueUsd,
  xlmRateLastFetchTimestamp,
  xlmRateStale,

  // AI metrics
  aiRequestsTotal,

  // Security metrics
  securityHeaderViolationsTotal,

  // Payment expiration job metrics
  paymentExpirationJobErrorsTotal,
  paymentExpirationJobLastRunExpired,
  paymentExpirationJobLastSuccessTimestamp,
  paymentExpirationJobConsecutiveFailures,

  // MongoDB pool metrics
  mongodbConnectionPoolSize,
  mongodbPoolWaitQueueSize,
  mongodbKeyDecryptionFailures,

  // Clinic balance gauge
  clinicXlmBalanceGauge,

  // Subscription and rate-limit metrics
  subscriptionLimitViolations,
  rateLimitHitsTotal,
} from './metrics.service';

// ── Business Metrics ──────────────────────────────────────────────────────────
/**
 * High-level domain metric helpers.
 * Each function wraps one or more raw Prometheus updates into a single
 * semantic action — prefer these over manipulating raw metrics directly.
 */
export {
  recordPaymentSuccessRate,
  updatePaymentSuccessRateFromCounts,
  recordEncounterDuration,
  updateActiveUsers,
  recordApiKeyRequest,
  recordStellarTransactionFee,
} from './business-metrics.service';

// ── Backup Metrics ────────────────────────────────────────────────────────────
/**
 * Lazy-registers Prometheus metrics for the backup-verification pipeline.
 * Call `initializeBackupMetrics()` once at server startup.
 */
export { initializeBackupMetrics } from './backup-metrics.service';

// ── Socket.IO Real-time ───────────────────────────────────────────────────────
/**
 * Real-time event broadcaster.
 * Wraps Socket.IO rooms so modules can broadcast without holding a
 * reference to the raw `io` server instance.
 *
 * Usage:
 *   SocketService.emitToClinic(clinicId, 'patient:updated', payload);
 *   SocketService.emitToUser(userId, 'notification:new', payload);
 */
export { SocketService } from './socket.service';
