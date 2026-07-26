import { PaymentRecordModel } from '../models/payment-record.model';
import logger from '@api/utils/logger';
import {
  paymentExpirationJobErrorsTotal,
  paymentExpirationJobLastRunExpired,
  paymentExpirationJobLastSuccessTimestamp,
  paymentExpirationJobConsecutiveFailures,
} from '@api/services/metrics.service';

/**
 * Payment Expiration Job
 *
 * Automatically expires pending payments based on their expiresAt timestamp.
 * Default expiry is 24 hours after creation.
 * Multi-sig payments use 24-hour timeout, escrow payments use 30-day timeout.
 *
 * Runs every 5 minutes to check for expired payments.
 */

export const CHECK_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const MAX_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 1000; // 1s, doubles each attempt (1s → 2s → 4s)

let expirationJobInterval: NodeJS.Timeout | null = null;
let lastSuccessfulRunAt: Date | null = null;
let consecutiveFailures = 0;

// ── Helpers ───────────────────────────────────────────────────────────────────

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function isTransientError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const name = err.name ?? '';
  const msg = err.message ?? '';
  return (
    name.includes('MongoNetwork') ||
    name.includes('MongoTopology') ||
    name.includes('MongoServerSelection') ||
    msg.includes('ECONNREFUSED') ||
    msg.includes('ENOTFOUND') ||
    msg.includes('ETIMEOUT') ||
    (msg.includes('connection') && msg.includes('close'))
  );
}

async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number,
  baseDelayMs: number
): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt < maxRetries && isTransientError(err)) {
        const delay = baseDelayMs * 2 ** attempt;
        logger.warn(
          { err, attempt, retryInMs: delay },
          '[payment-expiration-job] transient error — retrying'
        );
        await sleep(delay);
      } else {
        throw err;
      }
    }
  }
  throw lastErr;
}

// ── Core logic ────────────────────────────────────────────────────────────────

/**
 * Calculate expiry date based on payment type
 */
export function calculateExpiryDate(
  paymentType: 'immediate' | 'multisig' | 'escrow' = 'immediate'
): Date {
  const now = new Date();
  switch (paymentType) {
    case 'multisig':
      return new Date(now.getTime() + 24 * 60 * 60 * 1000);
    case 'escrow':
      return new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    case 'immediate':
    default:
      return new Date(now.getTime() + 24 * 60 * 60 * 1000);
  }
}

/**
 * Expire pending payments that have passed their expiresAt timestamp.
 * Retries up to MAX_RETRIES times for transient MongoDB errors.
 */
export async function expirePendingPayments(): Promise<number> {
  const now = new Date();
  const result = await withRetry(
    () =>
      PaymentRecordModel.updateMany(
        { status: 'pending', expiresAt: { $lt: now } },
        { status: 'failed' }
      ),
    MAX_RETRIES,
    RETRY_BASE_DELAY_MS
  );

  if (result.modifiedCount > 0) {
    logger.info({
      event: 'payments_expired',
      count: result.modifiedCount,
      timestamp: now.toISOString(),
    });
  }

  return result.modifiedCount;
}

/**
 * One tick of the expiration job — calls expirePendingPayments, updates
 * Prometheus metrics and module-level state, and swallows all errors so
 * the scheduler loop is never disrupted by a DB outage.
 */
export async function runExpirationJobTick(): Promise<void> {
  try {
    const expired = await expirePendingPayments();

    lastSuccessfulRunAt = new Date();
    consecutiveFailures = 0;

    paymentExpirationJobLastRunExpired.set(expired);
    paymentExpirationJobLastSuccessTimestamp.set(lastSuccessfulRunAt.getTime() / 1000);
    paymentExpirationJobConsecutiveFailures.set(0);
  } catch (err) {
    consecutiveFailures += 1;

    paymentExpirationJobErrorsTotal.inc();
    paymentExpirationJobConsecutiveFailures.set(consecutiveFailures);

    logger.error(
      {
        err,
        job: 'payment-expiration-job',
        consecutiveFailures,
      },
      '[payment-expiration-job] tick failed — payments may remain in pending status'
    );
  }
}

// ── Job lifecycle ─────────────────────────────────────────────────────────────

/**
 * Start the background job that periodically expires old pending payments
 */
export function startPaymentExpirationJob(): void {
  if (expirationJobInterval) {
    logger.warn('[payment-expiration-job] already running');
    return;
  }

  logger.info(
    `[payment-expiration-job] starting (interval=${CHECK_INTERVAL_MS / 1000}s, maxRetries=${MAX_RETRIES})`
  );

  // Run immediately on startup
  runExpirationJobTick();

  // Then run periodically
  expirationJobInterval = setInterval(() => runExpirationJobTick(), CHECK_INTERVAL_MS);
}

/**
 * Stop the background job
 */
export function stopPaymentExpirationJob(): void {
  if (expirationJobInterval) {
    clearInterval(expirationJobInterval);
    expirationJobInterval = null;
    logger.info('[payment-expiration-job] stopped');
  }
}

/**
 * Returns the current runtime status of the expiration job.
 * Used by the /health/jobs endpoint and internal monitoring.
 */
export function getJobStatus(): {
  running: boolean;
  lastSuccessfulRunAt: Date | null;
  consecutiveFailures: number;
} {
  return {
    running: expirationJobInterval !== null,
    lastSuccessfulRunAt,
    consecutiveFailures,
  };
}

/** @internal — only for use in unit tests */
export function _resetStateForTesting(): void {
  lastSuccessfulRunAt = null;
  consecutiveFailures = 0;
}

export function isPaymentExpirationJobRunning(): boolean {
  return expirationJobInterval !== null;
}
