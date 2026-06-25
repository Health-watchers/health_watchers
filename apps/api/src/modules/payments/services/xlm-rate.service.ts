import { XLMRateModel } from '../models/xlm-rate.model';
import { cache } from '@api/services/cache.service';
import logger from '@api/utils/logger';

/**
 * XLM/USD Exchange Rate Service
 *
 * Fetches the XLM→USD rate from an external source (CoinGecko, with a Stellar DEX
 * fallback), caches it in Redis with a 5-minute TTL, and persists every sample to
 * XLMRateModel for audit/historical purposes.
 *
 * Receipts use the rate captured at the time of payment when available, otherwise
 * the current cached rate, so the USD equivalent shown to patients is accurate.
 */

export const RATE_CACHE_KEY = 'xlm:rate:usd';
export const RATE_CACHE_TTL_SECONDS = 5 * 60; // 5 minutes
export const STALENESS_THRESHOLD_MS = 15 * 60 * 1000; // 15 minutes
export const FETCH_TIMEOUT_MS = 8000;

/** Last-resort rate used only when neither the cache, the DB, nor any source is available. */
export const FALLBACK_RATE_USD = 0.1;

const COINGECKO_URL =
  'https://api.coingecko.com/api/v3/simple/price?ids=stellar&vs_currencies=usd';
const STELLAR_DEX_URL =
  'https://api.stellar.expert/explorer/public/asset/XLM/stats';

export interface CachedRate {
  rateUSD: number;
  fetchedAt: string; // ISO timestamp
  source: string;
}

export interface CurrentRate extends CachedRate {
  /** Age of the rate in milliseconds. */
  ageMs: number;
  /** True when the rate is older than STALENESS_THRESHOLD_MS. */
  stale: boolean;
}

// ── External source fetching ──────────────────────────────────────────────────

async function fetchJson(url: string): Promise<unknown> {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) {
    throw new Error(`Rate source responded ${res.status} for ${url}`);
  }
  return res.json();
}

/**
 * Fetch the current XLM/USD rate from CoinGecko, falling back to the Stellar DEX.
 * Returns the rate and the source it came from. Throws if every source fails.
 */
export async function fetchXLMRateFromSource(): Promise<{ rateUSD: number; source: string }> {
  // Primary: CoinGecko
  try {
    const data = (await fetchJson(COINGECKO_URL)) as { stellar?: { usd?: number } };
    const rate = data?.stellar?.usd;
    if (typeof rate === 'number' && rate > 0) {
      return { rateUSD: rate, source: 'coingecko' };
    }
    throw new Error('CoinGecko returned no usable rate');
  } catch (primaryErr) {
    logger.warn({ err: primaryErr }, '[xlm-rate] CoinGecko fetch failed — trying Stellar DEX');
  }

  // Fallback: Stellar DEX (stellar.expert asset stats expose a USD price)
  try {
    const data = (await fetchJson(STELLAR_DEX_URL)) as { price?: number; price_usd?: number };
    const rate = data?.price_usd ?? data?.price;
    if (typeof rate === 'number' && rate > 0) {
      return { rateUSD: rate, source: 'stellar-dex' };
    }
    throw new Error('Stellar DEX returned no usable rate');
  } catch (fallbackErr) {
    logger.error({ err: fallbackErr }, '[xlm-rate] all rate sources failed');
    throw fallbackErr instanceof Error ? fallbackErr : new Error('rate fetch failed');
  }
}

// ── Cache + persistence ─────────────────────────────────────────────────────────

/** Read the cached rate from Redis, or null when not cached / Redis disabled. */
export async function getCachedRate(): Promise<CachedRate | null> {
  return cache.get<CachedRate>(RATE_CACHE_KEY);
}

/** Persist a rate sample to the historical collection (one document per fetch time). */
export async function storeHistoricalRate(
  rateUSD: number,
  source: string,
  at: Date
): Promise<void> {
  await XLMRateModel.updateOne(
    { date: at },
    { date: at, rateUSD, source },
    { upsert: true }
  );
}

/**
 * Fetch a fresh rate, cache it in Redis (5-min TTL) and store it historically.
 * Returns the freshly fetched rate. Throws if fetching fails (caller decides how
 * to react — the scheduled job swallows and records the error).
 */
export async function refreshXLMRate(now: Date = new Date()): Promise<CachedRate> {
  const { rateUSD, source } = await fetchXLMRateFromSource();

  const cached: CachedRate = { rateUSD, fetchedAt: now.toISOString(), source };
  await cache.set(RATE_CACHE_KEY, cached, RATE_CACHE_TTL_SECONDS);
  await storeHistoricalRate(rateUSD, source, now);

  return cached;
}

// ── Reads with staleness detection ──────────────────────────────────────────────

function decorate(cached: CachedRate, now: Date): CurrentRate {
  const ageMs = Math.max(0, now.getTime() - new Date(cached.fetchedAt).getTime());
  return { ...cached, ageMs, stale: ageMs > STALENESS_THRESHOLD_MS };
}

/**
 * Resolve the current XLM/USD rate. Prefers the Redis cache; falls back to the
 * latest historical record; finally to FALLBACK_RATE_USD. The returned object
 * carries an `ageMs`/`stale` flag so callers (and the endpoint) can surface
 * staleness. Never throws.
 */
export async function getCurrentXLMRate(now: Date = new Date()): Promise<CurrentRate> {
  const cached = await getCachedRate();
  if (cached) return decorate(cached, now);

  // Cache miss (TTL expired or Redis down) — fall back to the latest stored sample.
  try {
    const latest = await XLMRateModel.findOne().sort({ date: -1 }).lean<{
      rateUSD: number;
      source?: string;
      date: Date;
    }>();
    if (latest) {
      return decorate(
        {
          rateUSD: latest.rateUSD,
          fetchedAt: new Date(latest.date).toISOString(),
          source: latest.source ?? 'historical',
        },
        now
      );
    }
  } catch (err) {
    logger.warn({ err }, '[xlm-rate] historical lookup failed — using fallback rate');
  }

  return {
    rateUSD: FALLBACK_RATE_USD,
    fetchedAt: new Date(0).toISOString(),
    source: 'fallback',
    ageMs: now.getTime(),
    stale: true,
  };
}

/**
 * Return the rate (as a string, matching PaymentRecord.exchangeRate) to use on a
 * receipt: the rate captured at payment time when present, otherwise the current
 * cached rate.
 */
export async function getRateForReceipt(storedRate?: string): Promise<string> {
  if (storedRate && parseFloat(storedRate) > 0) return storedRate;
  const current = await getCurrentXLMRate();
  return current.rateUSD.toString();
}
