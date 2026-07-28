/**
 * exchange-rates.ts
 *
 * Issue #997 — [Stellar] Currency Exchange Integration
 *
 * Provides multi-currency support with real-time exchange rates:
 *   - Fetch rates from CoinGecko (free, no API key required)
 *   - Convert amounts between currencies with precision
 *   - In-memory rate cache with configurable TTL
 *   - Periodic automatic cache refresh
 *   - Graceful fallback to hardcoded rates when API is unavailable
 */

import logger from './logger.js';

// ── Types ──────────────────────────────────────────────────────────────────

export interface ExchangeRate {
  from: string;
  to: string;
  rate: number;
  timestamp: number;
  source: 'coingecko' | 'cache' | 'fallback';
}

export interface CachedExchangeRate extends ExchangeRate {
  cachedAt: number;
  expiresAt: number;
}

export interface ConversionResult {
  amount: number;
  from: string;
  to: string;
  converted: number;
  rate: number;
  source: ExchangeRate['source'];
  timestamp: number;
}

export interface RateCacheStats {
  totalCached: number;
  validCached: number;
  expiredCached: number;
  oldestEntry: number | null;
  newestEntry: number | null;
}

export type CurrencyCode = 'XLM' | 'USD' | 'EUR' | 'GBP' | 'JPY' | 'AUD' | 'CAD' | 'CHF';

// ── Constants ──────────────────────────────────────────────────────────────

/** Default cache TTL: 5 minutes */
const CACHE_DURATION_MS = 5 * 60 * 1_000;

/** API request timeout: 5 seconds */
const FETCH_TIMEOUT_MS = 5_000;

/**
 * Hardcoded fallback rates (XLM as base currency).
 * Used when the live API is unreachable and no cached value is available.
 * These are conservative estimates and should not be relied upon for
 * production transaction pricing.
 */
const FALLBACK_RATES: Record<string, Record<string, number>> = {
  XLM: {
    USD: 0.12,
    EUR: 0.11,
    GBP: 0.095,
    JPY: 18.0,
    AUD: 0.18,
    CAD: 0.16,
    CHF: 0.11,
  },
};

/** CoinGecko currency ID mapping */
const COINGECKO_IDS: Record<string, string> = {
  XLM: 'stellar',
  USD: 'usd',
  EUR: 'eur',
  GBP: 'gbp',
  JPY: 'jpy',
  AUD: 'aud',
  CAD: 'cad',
  CHF: 'chf',
};

// ── ExchangeRateManager ────────────────────────────────────────────────────

class ExchangeRateManager {
  /** In-memory rate cache: key = "FROM/TO" */
  private readonly cache: Map<string, CachedExchangeRate> = new Map();

  /** Handle for the periodic refresh setInterval */
  private refreshIntervalHandle: ReturnType<typeof setInterval> | null = null;

  // ── Private helpers ──────────────────────────────────────────────────────

  /** Build the cache key for a currency pair */
  private getCacheKey(from: string, to: string): string {
    return `${from.toUpperCase()}/${to.toUpperCase()}`;
  }

  /**
   * Map a currency code to its CoinGecko ID.
   * Returns null for unknown/unsupported currencies.
   */
  private getCoinGeckoId(currency: string): string | null {
    return COINGECKO_IDS[currency.toUpperCase()] ?? null;
  }

  /**
   * Fetch a live exchange rate from the CoinGecko public API.
   * Throws on network errors or unsupported currency pairs.
   */
  private async fetchFromCoinGecko(from: string, to: string): Promise<number> {
    const fromId = this.getCoinGeckoId(from);
    const toId = this.getCoinGeckoId(to);

    if (!fromId || !toId) {
      throw new Error(`Unsupported currency pair: ${from}/${to}`);
    }

    const url = `https://api.coingecko.com/api/v3/simple/price?ids=${fromId}&vs_currencies=${toId.toLowerCase()}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    try {
      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timeout);

      if (!response.ok) {
        throw new Error(`CoinGecko API returned ${response.status}: ${response.statusText}`);
      }

      const data = (await response.json()) as Record<string, Record<string, number>>;
      const rate = data[fromId]?.[toId.toLowerCase()];

      if (rate == null) {
        throw new Error(`No rate data returned for ${from}/${to}`);
      }

      return rate;
    } catch (error) {
      clearTimeout(timeout);
      logger.warn(
        { from, to, error: (error as Error).message },
        'Failed to fetch rate from CoinGecko'
      );
      throw error;
    }
  }

  /**
   * Write a rate entry to the cache.
   */
  private setCachedRate(
    from: string,
    to: string,
    rate: number,
    source: ExchangeRate['source'],
    ttlMs: number = CACHE_DURATION_MS
  ): CachedExchangeRate {
    const now = Date.now();
    const entry: CachedExchangeRate = {
      from: from.toUpperCase(),
      to: to.toUpperCase(),
      rate,
      timestamp: now,
      source,
      cachedAt: now,
      expiresAt: now + ttlMs,
    };
    this.cache.set(this.getCacheKey(from, to), entry);
    return entry;
  }

  // ── Public API ───────────────────────────────────────────────────────────

  /**
   * Fetch the exchange rate for a currency pair.
   *
   * Resolution order:
   *   1. Valid (non-expired) cache entry
   *   2. Live CoinGecko API (result is cached for CACHE_DURATION_MS)
   *   3. Hardcoded fallback rates (not cached — always fresh on next call)
   */
  async getExchangeRate(from: string, to: string): Promise<ExchangeRate> {
    const fromUpper = from.toUpperCase();
    const toUpper = to.toUpperCase();

    if (fromUpper === toUpper) {
      return { from: fromUpper, to: toUpper, rate: 1, timestamp: Date.now(), source: 'cache' };
    }

    const cacheKey = this.getCacheKey(fromUpper, toUpper);
    const cached = this.cache.get(cacheKey);

    // 1. Return valid cache hit
    if (cached && cached.expiresAt > Date.now()) {
      logger.debug({ from: fromUpper, to: toUpper, source: 'cache' }, 'Returning cached exchange rate');
      return {
        from: cached.from,
        to: cached.to,
        rate: cached.rate,
        timestamp: cached.timestamp,
        source: 'cache',
      };
    }

    // 2. Fetch from live API
    try {
      const rate = await this.fetchFromCoinGecko(fromUpper, toUpper);
      const entry = this.setCachedRate(fromUpper, toUpper, rate, 'coingecko');

      logger.info(
        { from: fromUpper, to: toUpper, rate, source: 'coingecko' },
        'Fetched and cached exchange rate'
      );

      return { from: entry.from, to: entry.to, rate: entry.rate, timestamp: entry.timestamp, source: 'coingecko' };
    } catch (fetchError) {
      // 3. Fall back to hardcoded rates
      const fallbackRate = FALLBACK_RATES[fromUpper]?.[toUpper];
      if (fallbackRate !== undefined) {
        logger.warn(
          { from: fromUpper, to: toUpper, rate: fallbackRate, source: 'fallback' },
          'Using hardcoded fallback exchange rate'
        );
        return { from: fromUpper, to: toUpper, rate: fallbackRate, timestamp: Date.now(), source: 'fallback' };
      }

      logger.error(
        { from: fromUpper, to: toUpper, error: (fetchError as Error).message },
        'No exchange rate available (API failed, no fallback)'
      );
      throw new Error(`No exchange rate available for ${fromUpper}/${toUpper}`);
    }
  }

  /**
   * Convert an amount from one currency to another.
   * Returns a full ConversionResult including the rate used.
   */
  async convertCurrency(amount: number, from: string, to: string): Promise<ConversionResult> {
    if (amount < 0) {
      throw new Error('Amount must be non-negative');
    }

    const fromUpper = from.toUpperCase();
    const toUpper = to.toUpperCase();

    if (fromUpper === toUpper) {
      return {
        amount,
        from: fromUpper,
        to: toUpper,
        converted: amount,
        rate: 1,
        source: 'cache',
        timestamp: Date.now(),
      };
    }

    const exchangeRate = await this.getExchangeRate(fromUpper, toUpper);
    const converted = parseFloat((amount * exchangeRate.rate).toFixed(8));

    logger.info(
      { amount, from: fromUpper, to: toUpper, rate: exchangeRate.rate, converted, source: exchangeRate.source },
      'Currency converted'
    );

    return {
      amount,
      from: fromUpper,
      to: toUpper,
      converted,
      rate: exchangeRate.rate,
      source: exchangeRate.source,
      timestamp: exchangeRate.timestamp,
    };
  }

  /**
   * Fetch rates for multiple target currencies from a single base currency.
   * Runs all fetches in parallel.
   */
  async getMultipleRates(from: string, toCurrencies: string[]): Promise<ExchangeRate[]> {
    if (!toCurrencies.length) {
      return [];
    }
    const promises = toCurrencies.map((to) => this.getExchangeRate(from, to));
    return Promise.all(promises);
  }

  /**
   * Force-refresh the rate for a specific currency pair by evicting the
   * existing cache entry before fetching.
   */
  async refreshRate(from: string, to: string): Promise<ExchangeRate> {
    const cacheKey = this.getCacheKey(from, to);
    this.cache.delete(cacheKey);
    logger.info({ from, to }, 'Refreshing exchange rate (cache evicted)');
    return this.getExchangeRate(from, to);
  }

  /**
   * Force-refresh all rates currently held in the cache.
   * Individual failures are logged but do not abort the refresh of other pairs.
   */
  async refreshAllRates(): Promise<void> {
    const pairs = Array.from(this.cache.keys());
    if (!pairs.length) {
      logger.debug('No cached rates to refresh');
      return;
    }

    logger.info({ count: pairs.length }, 'Refreshing all cached rates');

    const results = await Promise.allSettled(
      pairs.map((pair) => {
        const [from, to] = pair.split('/');
        return this.refreshRate(from, to);
      })
    );

    const failed = results.filter((r) => r.status === 'rejected');
    if (failed.length) {
      logger.warn({ failedCount: failed.length, totalCount: pairs.length }, 'Some rates failed to refresh');
    } else {
      logger.info({ count: pairs.length }, 'All cached rates refreshed successfully');
    }
  }

  /**
   * Start a background interval that calls refreshAllRates() on a schedule.
   * No-ops if already running.
   */
  startPeriodicRefresh(intervalMs: number = CACHE_DURATION_MS): void {
    if (this.refreshIntervalHandle !== null) {
      logger.warn('Periodic refresh is already running');
      return;
    }

    logger.info({ intervalMs }, 'Starting periodic exchange rate refresh');

    this.refreshIntervalHandle = setInterval(() => {
      this.refreshAllRates().catch((error) => {
        logger.error({ error: (error as Error).message }, 'Periodic rate refresh failed');
      });
    }, intervalMs);

    // Allow Node.js to exit even if the interval is still running
    if (typeof this.refreshIntervalHandle === 'object' && 'unref' in this.refreshIntervalHandle) {
      (this.refreshIntervalHandle as NodeJS.Timeout).unref();
    }
  }

  /**
   * Stop the background refresh interval.
   */
  stopPeriodicRefresh(): void {
    if (this.refreshIntervalHandle !== null) {
      clearInterval(this.refreshIntervalHandle);
      this.refreshIntervalHandle = null;
      logger.info('Periodic exchange rate refresh stopped');
    }
  }

  /**
   * Returns true when the periodic refresh scheduler is active.
   */
  isPeriodicRefreshRunning(): boolean {
    return this.refreshIntervalHandle !== null;
  }

  /**
   * Return all valid (non-expired) rates from the cache.
   */
  getCachedRates(): ExchangeRate[] {
    const now = Date.now();
    return Array.from(this.cache.values())
      .filter((entry) => entry.expiresAt > now)
      .map(({ from, to, rate, timestamp, source }) => ({ from, to, rate, timestamp, source }));
  }

  /**
   * Evict all entries from the cache.
   */
  clearCache(): void {
    const count = this.cache.size;
    this.cache.clear();
    logger.info({ count }, 'Exchange rate cache cleared');
  }

  /**
   * Return cache health statistics.
   */
  getCacheStats(): RateCacheStats {
    const now = Date.now();
    let validCached = 0;
    let expiredCached = 0;
    let oldestEntry: number | null = null;
    let newestEntry: number | null = null;

    for (const entry of this.cache.values()) {
      if (entry.expiresAt > now) {
        validCached++;
      } else {
        expiredCached++;
      }
      if (oldestEntry === null || entry.cachedAt < oldestEntry) {
        oldestEntry = entry.cachedAt;
      }
      if (newestEntry === null || entry.cachedAt > newestEntry) {
        newestEntry = entry.cachedAt;
      }
    }

    return {
      totalCached: this.cache.size,
      validCached,
      expiredCached,
      oldestEntry,
      newestEntry,
    };
  }

  /**
   * Retrieve a single cached entry (valid or expired) by key.
   * Useful for diagnostics.
   */
  getCachedEntry(from: string, to: string): CachedExchangeRate | undefined {
    return this.cache.get(this.getCacheKey(from, to));
  }

  /**
   * List all currency pairs that have cached entries.
   */
  getCachedPairs(): string[] {
    return Array.from(this.cache.keys());
  }
}

// ── Singleton export ───────────────────────────────────────────────────────

export const exchangeRateManager = new ExchangeRateManager();
