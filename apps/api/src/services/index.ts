/**
 * Shared Services — Barrel Exports
 *
 * This file provides a single entry point for all shared API services.
 * Import from this barrel instead of from individual service files to
 * benefit from consistent naming and improved discoverability.
 *
 * Organized by responsibility:
 *
 * ┌──────────────────────────┬──────────────────────────────────────────────┐
 * │ Service                  │ Responsibility                               │
 * ├──────────────────────────┼──────────────────────────────────────────────┤
 * │ cache                    │ Redis-backed get/set/del with TTL support    │
 * │ token-denylist           │ JWT revocation via Redis denylist            │
 * │ metrics                  │ Prometheus counters, histograms, gauges      │
 * │ business-metrics         │ Domain-level KPIs (payments, encounters)     │
 * │ backup-metrics           │ Backup verification Prometheus metrics       │
 * │ SocketService            │ Socket.IO real-time event broadcasting       │
 * └──────────────────────────┴──────────────────────────────────────────────┘
 *
 * Example usage:
 *   import { cache, httpRequestsTotal, SocketService } from '@api/services';
 */

// ── Cache ─────────────────────────────────────────────────────────────────────
export { cache, getCacheMetrics } from './cache.service';

// ── Token Denylist ────────────────────────────────────────────────────────────
export {
  addToDenylist,
  isDenylisted,
  setUserInvalidatedAt,
  isInvalidatedForUser,
} from './token-denylist.service';

// ── Prometheus Metrics ────────────────────────────────────────────────────────
export {
  register,
  normalisePath,
  httpRequestsTotal,
  httpRequestDurationSeconds,
  httpRequestSizeBytes,
  httpResponseSizeBytes,
  patientsCreatedTotal,
  encountersCreatedTotal,
  paymentsInitiatedTotal,
  paymentsConfirmedTotal,
  paymentSuccessRate,
  encounterDurationSeconds,
  activeUsersTotal,
  apiKeyRequestsTotal,
  stellarTransactionFeeXlm,
  feeStrategySelectedTotal,
  feeAmountPaidXlm,
  aiRequestsTotal,
  securityHeaderViolationsTotal,
  paymentExpirationJobErrorsTotal,
  paymentExpirationJobLastRunExpired,
  paymentExpirationJobLastSuccessTimestamp,
  paymentExpirationJobConsecutiveFailures,
  xlmRateFetchErrorsTotal,
  xlmRateLastValueUsd,
  xlmRateLastFetchTimestamp,
  xlmRateStale,
  mongodbConnectionPoolSize,
  mongodbPoolWaitQueueSize,
  mongodbKeyDecryptionFailures,
  clinicXlmBalanceGauge,
  subscriptionLimitViolations,
  rateLimitHitsTotal,
} from './metrics.service';

// ── Business Metrics ──────────────────────────────────────────────────────────
export {
  recordPaymentSuccessRate,
  updatePaymentSuccessRateFromCounts,
  recordEncounterDuration,
  updateActiveUsers,
  recordApiKeyRequest,
  recordStellarTransactionFee,
} from './business-metrics.service';

// ── Backup Metrics ────────────────────────────────────────────────────────────
export { initializeBackupMetrics } from './backup-metrics.service';

// ── Socket.IO Real-time ───────────────────────────────────────────────────────
export { SocketService } from './socket.service';
