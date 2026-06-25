/**
 * Automatic fee strategy selection based on:
 *   - Payment amount  (high-value → fast)
 *   - Time of day     (off-peak  → slow)
 *   - Network congestion reported by the fee estimate endpoint
 */

export type FeeStrategy = 'slow' | 'standard' | 'fast';

export interface FeeEstimate {
  /** Median fee in stroops */
  fee_charged?: { p50?: number; p90?: number };
  /** Base-fee percentiles (Horizon format) */
  max_fee?: { p50?: number; p90?: number };
  [key: string]: unknown;
}

export interface FeeOptimizerOptions {
  /** Payment amount as a decimal string (e.g. "500.00") */
  amount: string;
  /** Current UTC hour (0-23) — injected to allow deterministic testing */
  utcHour?: number;
  /** Latest fee estimate from the Stellar network */
  feeEstimate?: FeeEstimate | null;
  /** If true, the caller explicitly asked to minimise fees (clinic preference) */
  preferLowFees?: boolean;
}

/** Thresholds that drive strategy selection */
const HIGH_VALUE_THRESHOLD = 100;      // XLM — prefer fast for high-value payments
const OFF_PEAK_START_HOUR = 22;        // 22:00 UTC
const OFF_PEAK_END_HOUR = 6;           // 06:00 UTC (exclusive upper bound)
const CONGESTION_RATIO = 3;            // p90/p50 > 3x → congested

/**
 * Returns true when the given UTC hour falls in the off-peak window
 * (22:00 – 06:00 UTC, i.e. wraps midnight).
 */
export function isOffPeak(utcHour: number): boolean {
  return utcHour >= OFF_PEAK_START_HOUR || utcHour < OFF_PEAK_END_HOUR;
}

/**
 * Returns true when network appears congested based on the fee estimate.
 * Congestion is declared when p90 fee ≥ CONGESTION_RATIO × p50 fee.
 */
export function isCongested(feeEstimate: FeeEstimate | null | undefined): boolean {
  if (!feeEstimate) return false;
  const bucket = feeEstimate.fee_charged ?? feeEstimate.max_fee;
  if (!bucket) return false;
  const p50 = bucket.p50 ?? 0;
  const p90 = bucket.p90 ?? 0;
  return p50 > 0 && p90 >= p50 * CONGESTION_RATIO;
}

/**
 * Selects the optimal fee strategy given amount, time, and network conditions.
 *
 * Priority order (first match wins):
 *  1. Congested network        → fast  (avoid stuck tx)
 *  2. High-value payment       → fast  (minimise settlement risk)
 *  3. Off-peak + low-fee pref  → slow  (cheapest)
 *  4. Off-peak (no pref)       → slow
 *  5. Default                  → standard
 */
export function selectFeeStrategy(opts: FeeOptimizerOptions): FeeStrategy {
  const amountNum = parseFloat(opts.amount) || 0;
  const hour = opts.utcHour ?? new Date().getUTCHours();

  if (isCongested(opts.feeEstimate)) {
    return 'fast';
  }

  if (amountNum >= HIGH_VALUE_THRESHOLD) {
    return 'fast';
  }

  if (isOffPeak(hour)) {
    return 'slow';
  }

  return 'standard';
}
