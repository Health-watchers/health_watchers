import logger from './logger.js';

export interface ExchangeRate {
  from: string;
  to: string;
  rate: number;
  timestamp: number;
  source: string;
}

export interface CachedExchangeRate extends ExchangeRate {
  cachedAt: number;
  expiresAt: number;
}

export type CurrencyCode = 'XLM' | 'USD' | 'EUR' | 'GBP' | 'JPY' | 'AUD' | 'CAD' | 'CHF';

const CACHE_DURATION_MS = 5 * 60 * 1000; // 5 minutes
const FALLBACK_RATES: Record<string, Record<string, number>> = {
  XLM: {
    USD: 0.12,
    EUR: 0.11,
    GBP: 0.095,
    JPY: 18,
    AUD: 0.18,
    CAD: 0.16,
    CHF: 0.11,
  },
};

class ExchangeRateManager {
  private cache: Map<string, CachedExchangeRate> = new Map();
  private refreshInterval: ReturnType<typeof setInterval> | null = null;

  /**
   * Get cache key for currency pair
   */
  private getCacheKey(from: string, to: string): string {
    return `${from}/${to}`;
  }

  /**
   * Fetch exchange rate from CoinGecko API (free, no auth required)
   */
  private async fetchFromCoinGecko(from: string, to: string): Promise<number> {
    const fromId = this.getCoinGeckoId(from);
    const toId = this.getCoinGeckoId(to);

    if (!fromId || !toId) {
      throw new Error(`Unsupported currency pair: ${from}/${to}`);
    }

    try {
      const url = `https://api.coingecko.com/api/v3/simple/price?ids=${fromId}&vs_currencies=${toId.toLowerCase()}`;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timeout);

      if (!response.ok) {
        throw new Error(`CoinGecko API error: ${response.statusText}`);
      }

      const data = (await response.json()) as Record<string, Record<string, number>>;
      const rate = data[fromId]?.[toId.toLowerCase()];

      if (!rate) {
        throw new Error(`No rate data for ${from}/${to}`);
      }

      return rate;
    } catch (error) {
      logger.warn(
        { from, to, error: (error as any)?.message },
        'Failed to fetch rate from CoinGecko, falling back to cached/default rates'
      );
      throw error;
    }
  }

  /**
   * Map currency code to CoinGecko ID
   */
  private getCoinGeckoId(currency: string): string | null {
    const mapping: Record<string, string> = {
      XLM: 'stellar',
      USD: 'usd',
      EUR: 'eur',
      GBP: 'gbp',
      JPY: 'jpy',
      AUD: 'aud',
      CAD: 'cad',
      CHF: 'chf',
    };
    return mapping[currency.toUpperCase()] || null;
  }

  /**
   * Get exchange rate with automatic fallback
   */
  async getExchangeRate(from: string, to: string): Promise<ExchangeRate> {
    const cacheKey = this.getCacheKey(from, to);

    // Check cache
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      logger.debug({ from, to, source: 'cache' }, 'Using cached exchange rate');
      return {
        from: cached.from,
        to: cached.to,
        rate: cached.rate,
        timestamp: cached.timestamp,
        source: 'cache',
      };
    }

    try {
      // Try to fetch fresh rate
      const rate = await this.fetchFromCoinGecko(from, to);
      const timestamp = Date.now();

      const exchangeRate: CachedExchangeRate = {
        from,
        to,
        rate,
        timestamp,
        source: 'coingecko',
        cachedAt: timestamp,
        expiresAt: timestamp + CACHE_DURATION_MS,
      };

      this.cache.set(cacheKey, exchangeRate);

      logger.info({ from, to, rate, source: 'coingecko' }, 'Fetched and cached exchange rate');

      return {
        from,
        to,
        rate,
        timestamp,
        source: 'coingecko',
      };
    } catch (error) {
      logger.warn({ from, to, error: (error as any)?.message }, 'Failed to fetch rate from API');

      // Use fallback rate
      const fallbackRate = FALLBACK_RATES[from]?.[to];
      if (fallbackRate) {
        logger.warn({ from, to, rate: fallbackRate, source: 'fallback' }, 'Using fallback rate');
        return {
          from,
          to,
          rate: fallbackRate,
          timestamp: Date.now(),
          source: 'fallback',
        };
      }

      throw error;
    }
  }

  /**
   * Convert amount from one currency to another
   */
  async convertCurrency(amount: number, from: string, to: string): Promise<number> {
    if (from === to) {
      return amount;
    }

    const exchangeRate = await this.getExchangeRate(from, to);
    const converted = amount * exchangeRate.rate;

    logger.info(
      { amount, from, to, rate: exchangeRate.rate, converted, source: exchangeRate.source },
      'Currency converted'
    );

    return parseFloat(converted.toFixed(8));
  }

  /**
   * Get multiple exchange rates
   */
  async getMultipleRates(from: string, toCurrencies: string[]): Promise<ExchangeRate[]> {
    const promises = toCurrencies.map((to) => this.getExchangeRate(from, to));
    return Promise.all(promises);
  }

  /**
   * Refresh a specific rate immediately
   */
  async refreshRate(from: string, to: string): Promise<ExchangeRate> {
    const cacheKey = this.getCacheKey(from, to);
    this.cache.delete(cacheKey); // Remove from cache to force fresh fetch

    logger.info({ from, to }, 'Refreshing exchange rate');
    return this.getExchangeRate(from, to);
  }

  /**
   * Refresh all rates in cache
   */
  async refreshAllRates(): Promise<void> {
    const currencyPairs = Array.from(this.cache.keys());

    if (currencyPairs.length === 0) {
      logger.debug('No cached rates to refresh');
      return;
    }

    logger.info({ count: currencyPairs.length }, 'Refreshing all cached rates');

    const promises = currencyPairs.map((pair) => {
      const [from, to] = pair.split('/');
      return this.refreshRate(from, to).catch((error) => {
        logger.warn({ from, to, error: (error as any)?.message }, 'Failed to refresh rate');
      });
    });

    await Promise.all(promises);
  }

  /**
   * Start periodic rate refresh
   */
  startPeriodicRefresh(intervalMs: number = CACHE_DURATION_MS): void {
    if (this.refreshInterval) {
      logger.warn('Periodic refresh already started');
      return;
    }

    logger.info({ intervalMs }, 'Starting periodic exchange rate refresh');

    this.refreshInterval = setInterval(() => {
      this.refreshAllRates().catch((error) => {
        logger.error({ error: (error as any)?.message }, 'Periodic rate refresh failed');
      });
    }, intervalMs);
  }

  /**
   * Stop periodic rate refresh
   */
  stopPeriodicRefresh(): void {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
      this.refreshInterval = null;
      logger.info('Periodic exchange rate refresh stopped');
    }
  }

  /**
   * Get all cached rates
   */
  getCachedRates(): ExchangeRate[] {
    return Array.from(this.cache.values()).map((cached) => ({
      from: cached.from,
      to: cached.to,
      rate: cached.rate,
      timestamp: cached.timestamp,
      source: cached.source,
    }));
  }

  /**
   * Clear all cached rates
   */
  clearCache(): void {
    const count = this.cache.size;
    this.cache.clear();
    logger.info({ count }, 'Cleared exchange rate cache');
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): {
    totalCached: number;
    validCached: number;
    expiredCached: number;
  } {
    const now = Date.now();
    let validCount = 0;
    let expiredCount = 0;

    this.cache.forEach((cached) => {
      if (cached.expiresAt > now) {
        validCount++;
      } else {
        expiredCount++;
      }
    });

    return {
      totalCached: this.cache.size,
      validCached: validCount,
      expiredCached: expiredCount,
    };
  }
}

export const exchangeRateManager = new ExchangeRateManager();
