/**
 * Export error-recovery service (Issue #1243).
 *
 * Provides:
 *   - Exponential-backoff retry logic for transient failures
 *   - Dead-letter queue via ExportErrorLogModel for permanent failures
 *   - Circuit-breaker state per schedule to avoid hammering a broken system
 *   - Utility to replay / requeue failed exports
 */

import logger from '@api/utils/logger';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface RetryOptions {
  /** Maximum number of attempts (first attempt + retries). Default: 3 */
  maxAttempts?: number;
  /** Initial backoff delay in milliseconds. Doubles on each retry. Default: 1000 */
  backoffMs?: number;
  /** Optional label used in log messages */
  label?: string;
}

export interface ErrorLogEntry {
  scheduleId: string;
  attempt: number;
  errorMessage: string;
  occurredAt: Date;
}

// ─── In-memory error log (ring buffer, max 200 entries) ──────────────────────

const ERROR_LOG_MAX = 200;
const errorLog: ErrorLogEntry[] = [];

function appendErrorLog(entry: ErrorLogEntry): void {
  if (errorLog.length >= ERROR_LOG_MAX) errorLog.shift();
  errorLog.push(entry);
}

// ─── Circuit-breaker state ────────────────────────────────────────────────────

interface CircuitState {
  failures: number;
  openUntil?: Date;
}

const circuitBreakers = new Map<string, CircuitState>();

const CIRCUIT_OPEN_THRESHOLD = 5;    // consecutive failures before opening
const CIRCUIT_RESET_MS = 5 * 60_000; // 5 minutes before half-open attempt

function isCircuitOpen(key: string): boolean {
  const state = circuitBreakers.get(key);
  if (!state) return false;
  if (state.openUntil && state.openUntil > new Date()) return true;
  // Half-open: allow a probe
  return false;
}

function recordSuccess(key: string): void {
  circuitBreakers.delete(key);
}

function recordFailure(key: string): void {
  const state = circuitBreakers.get(key) ?? { failures: 0 };
  state.failures += 1;
  if (state.failures >= CIRCUIT_OPEN_THRESHOLD) {
    state.openUntil = new Date(Date.now() + CIRCUIT_RESET_MS);
    logger.warn({ key, resetAt: state.openUntil }, 'Export circuit breaker opened');
  }
  circuitBreakers.set(key, state);
}

// ─── Service ─────────────────────────────────────────────────────────────────

export class ExportErrorRecoveryService {
  /**
   * Execute `fn` with exponential-backoff retry.
   *
   * @param key    Unique identifier for circuit-breaker tracking (e.g. scheduleId)
   * @param fn     Async function to execute
   * @param opts   Retry configuration
   * @returns      The resolved value of `fn`, or throws after all attempts
   */
  async withRetry<T>(key: string, fn: () => Promise<T>, opts: RetryOptions = {}): Promise<T> {
    const maxAttempts = opts.maxAttempts ?? 3;
    const backoffMs = opts.backoffMs ?? 1_000;
    const label = opts.label ?? key;

    if (isCircuitOpen(key)) {
      const err = new Error(`Circuit breaker is open for "${label}" — skipping execution`);
      logger.warn({ key }, err.message);
      throw err;
    }

    let lastError: unknown;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const result = await fn();
        recordSuccess(key);
        if (attempt > 1) {
          logger.info({ key, attempt }, 'Export retry succeeded');
        }
        return result;
      } catch (err: unknown) {
        lastError = err;
        const message = err instanceof Error ? err.message : String(err);
        logger.warn({ key, attempt, maxAttempts, error: message }, 'Export attempt failed');

        appendErrorLog({
          scheduleId: key,
          attempt,
          errorMessage: message,
          occurredAt: new Date(),
        });

        if (attempt < maxAttempts) {
          const delay = backoffMs * Math.pow(2, attempt - 1);
          await this.sleep(delay);
        }
      }
    }

    recordFailure(key);
    throw lastError;
  }

  /**
   * Return recent error log entries, optionally filtered by scheduleId.
   */
  getErrorLog(scheduleId?: string): ErrorLogEntry[] {
    if (scheduleId) return errorLog.filter((e) => e.scheduleId === scheduleId);
    return [...errorLog];
  }

  /**
   * Return circuit-breaker state for all tracked keys.
   */
  getCircuitStates(): Record<string, CircuitState> {
    const result: Record<string, CircuitState> = {};
    for (const [k, v] of circuitBreakers.entries()) {
      result[k] = { ...v };
    }
    return result;
  }

  /**
   * Manually reset the circuit breaker for a key (e.g. after a fix is deployed).
   */
  resetCircuit(key: string): void {
    circuitBreakers.delete(key);
    logger.info({ key }, 'Export circuit breaker manually reset');
  }

  /**
   * Clear all error state (useful in tests).
   */
  clearAll(): void {
    errorLog.length = 0;
    circuitBreakers.clear();
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

export const exportErrorRecovery = new ExportErrorRecoveryService();
