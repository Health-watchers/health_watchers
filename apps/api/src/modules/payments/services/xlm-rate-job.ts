import logger from '@api/utils/logger';
import {
  xlmRateFetchErrorsTotal,
  xlmRateLastValueUsd,
  xlmRateLastFetchTimestamp,
  xlmRateStale,
} from '@api/services/metrics.service';
import {
  refreshXLMRate,
  getCurrentXLMRate,
  STALENESS_THRESHOLD_MS,
} from './xlm-rate.service';

/**
 * XLM Exchange Rate Job
 *
 * Every 5 minutes, fetches the latest XLM/USD rate from an external source,
 * caches it in Redis (5-min TTL) and stores it historically. Also emits
 * Prometheus metrics and flags staleness (rate older than 15 minutes) so
 * alerting can fire when the rate feed stops updating.
 */

export const REFRESH_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

let rateJobInterval: NodeJS.Timeout | null = null;
let lastSuccessfulFetchAt: Date | null = null;
let consecutiveFailures = 0;

/**
 * One tick: refresh the rate, update metrics, and check staleness. Swallows all
 * errors so a flaky rate source never crashes the scheduler loop.
 */
export async function runRateJobTick(now: Date = new Date()): Promise<void> {
  try {
    const cached = await refreshXLMRate(now);

    lastSuccessfulFetchAt = now;
    consecutiveFailures = 0;

    xlmRateLastValueUsd.set(cached.rateUSD);
    xlmRateLastFetchTimestamp.set(now.getTime() / 1000);
    xlmRateStale.set(0);

    logger.info(
      { event: 'xlm_rate_refreshed', rateUSD: cached.rateUSD, source: cached.source },
      '[xlm-rate-job] rate refreshed'
    );
  } catch (err) {
    consecutiveFailures += 1;
    xlmRateFetchErrorsTotal.inc();

    // Surface staleness based on the last good fetch (or "never fetched").
    const ageMs = lastSuccessfulFetchAt
      ? now.getTime() - lastSuccessfulFetchAt.getTime()
      : Infinity;
    const stale = ageMs > STALENESS_THRESHOLD_MS;
    xlmRateStale.set(stale ? 1 : 0);

    logger.error(
      { err, job: 'xlm-rate-job', consecutiveFailures, stale },
      '[xlm-rate-job] tick failed — exchange rate may be stale'
    );

    if (stale) {
      logger.warn(
        {
          event: 'xlm_rate_stale',
          lastSuccessfulFetchAt: lastSuccessfulFetchAt?.toISOString() ?? null,
          thresholdMs: STALENESS_THRESHOLD_MS,
        },
        '[xlm-rate-job] ALERT: XLM/USD rate data is stale'
      );
    }
  }
}

export function startXLMRateJob(): void {
  if (rateJobInterval) {
    logger.warn('[xlm-rate-job] already running');
    return;
  }
  logger.info(`[xlm-rate-job] starting (interval=${REFRESH_INTERVAL_MS / 1000}s)`);

  // Fetch immediately on startup so the cache is warm.
  runRateJobTick();

  rateJobInterval = setInterval(() => runRateJobTick(), REFRESH_INTERVAL_MS);
}

export function stopXLMRateJob(): void {
  if (rateJobInterval) {
    clearInterval(rateJobInterval);
    rateJobInterval = null;
    logger.info('[xlm-rate-job] stopped');
  }
}

/**
 * Returns whether the cached rate is currently stale (older than the staleness
 * threshold). Used by the exchange-rate endpoint and monitoring.
 */
export async function isRateStale(): Promise<boolean> {
  const current = await getCurrentXLMRate();
  return current.stale;
}

export function getRateJobStatus(): {
  running: boolean;
  lastSuccessfulFetchAt: Date | null;
  consecutiveFailures: number;
} {
  return {
    running: rateJobInterval !== null,
    lastSuccessfulFetchAt,
    consecutiveFailures,
  };
}

export function isXLMRateJobRunning(): boolean {
  return rateJobInterval !== null;
}

/** @internal — only for use in unit tests */
export function _resetStateForTesting(): void {
  lastSuccessfulFetchAt = null;
  consecutiveFailures = 0;
}
