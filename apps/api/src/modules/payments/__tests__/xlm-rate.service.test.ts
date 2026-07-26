/**
 * Unit tests for the XLM/USD exchange rate service: source fetching with
 * fallback, Redis caching, historical persistence, and staleness detection.
 *
 * All external dependencies (Redis cache, Mongo model, logger, global fetch)
 * are mocked — no real network or DB.
 */

// ── Module mocks (hoisted before imports) ────────────────────────────────────

jest.mock('@api/services/cache.service', () => ({
  cache: {
    get: jest.fn(),
    set: jest.fn(),
  },
}));

jest.mock('../models/xlm-rate.model', () => ({
  XLMRateModel: {
    updateOne: jest.fn(),
    findOne: jest.fn(),
  },
}));

jest.mock('@api/utils/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

// ── Imports ───────────────────────────────────────────────────────────────────

import { cache } from '@api/services/cache.service';
import { XLMRateModel } from '../models/xlm-rate.model';
import {
  fetchXLMRateFromSource,
  refreshXLMRate,
  getCurrentXLMRate,
  getRateForReceipt,
  getCachedRate,
  RATE_CACHE_KEY,
  RATE_CACHE_TTL_SECONDS,
  STALENESS_THRESHOLD_MS,
  FALLBACK_RATE_USD,
} from '../services/xlm-rate.service';

const cacheGet = cache.get as jest.Mock;
const cacheSet = cache.set as jest.Mock;
const updateOneMock = XLMRateModel.updateOne as jest.Mock;
const findOneMock = XLMRateModel.findOne as jest.Mock;

// global fetch mock
const fetchMock = jest.fn();
(global as unknown as { fetch: jest.Mock }).fetch = fetchMock;

function okJson(body: unknown) {
  return { ok: true, status: 200, json: async () => body };
}

beforeEach(() => {
  jest.clearAllMocks();
  cacheGet.mockResolvedValue(null);
  cacheSet.mockResolvedValue(undefined);
  updateOneMock.mockResolvedValue({ acknowledged: true });
  // findOne(...).sort(...).lean() chain
  findOneMock.mockReturnValue({ sort: () => ({ lean: () => Promise.resolve(null) }) });
});

describe('fetchXLMRateFromSource', () => {
  it('returns the CoinGecko rate when the primary source succeeds', async () => {
    fetchMock.mockResolvedValueOnce(okJson({ stellar: { usd: 0.1234 } }));
    const result = await fetchXLMRateFromSource();
    expect(result).toEqual({ rateUSD: 0.1234, source: 'coingecko' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('falls back to the Stellar DEX when CoinGecko fails', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({}) });
    fetchMock.mockResolvedValueOnce(okJson({ price_usd: 0.099 }));
    const result = await fetchXLMRateFromSource();
    expect(result).toEqual({ rateUSD: 0.099, source: 'stellar-dex' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('throws when every source fails', async () => {
    fetchMock.mockRejectedValueOnce(new Error('network down'));
    fetchMock.mockRejectedValueOnce(new Error('network down'));
    await expect(fetchXLMRateFromSource()).rejects.toThrow();
  });

  it('treats a non-positive rate as unusable and falls back', async () => {
    fetchMock.mockResolvedValueOnce(okJson({ stellar: { usd: 0 } }));
    fetchMock.mockResolvedValueOnce(okJson({ price: 0.1 }));
    const result = await fetchXLMRateFromSource();
    expect(result.source).toBe('stellar-dex');
  });
});

describe('refreshXLMRate', () => {
  it('caches the rate in Redis with a 5-minute TTL and stores it historically', async () => {
    fetchMock.mockResolvedValueOnce(okJson({ stellar: { usd: 0.11 } }));
    const now = new Date('2026-05-29T12:00:00Z');

    const result = await refreshXLMRate(now);

    expect(result).toEqual({ rateUSD: 0.11, fetchedAt: now.toISOString(), source: 'coingecko' });
    expect(cacheSet).toHaveBeenCalledWith(RATE_CACHE_KEY, result, RATE_CACHE_TTL_SECONDS);
    expect(updateOneMock).toHaveBeenCalledWith(
      { date: now },
      { date: now, rateUSD: 0.11, source: 'coingecko' },
      { upsert: true }
    );
  });
});

describe('getCurrentXLMRate', () => {
  it('returns a fresh cached rate as not stale', async () => {
    const now = new Date('2026-05-29T12:00:00Z');
    cacheGet.mockResolvedValueOnce({
      rateUSD: 0.12,
      fetchedAt: new Date(now.getTime() - 60_000).toISOString(),
      source: 'coingecko',
    });

    const rate = await getCurrentXLMRate(now);
    expect(rate.rateUSD).toBe(0.12);
    expect(rate.stale).toBe(false);
    expect(rate.ageMs).toBe(60_000);
  });

  it('flags a cached rate older than the staleness threshold as stale', async () => {
    const now = new Date('2026-05-29T12:00:00Z');
    cacheGet.mockResolvedValueOnce({
      rateUSD: 0.12,
      fetchedAt: new Date(now.getTime() - (STALENESS_THRESHOLD_MS + 1000)).toISOString(),
      source: 'coingecko',
    });

    const rate = await getCurrentXLMRate(now);
    expect(rate.stale).toBe(true);
  });

  it('falls back to the latest stored sample on a cache miss', async () => {
    const now = new Date('2026-05-29T12:00:00Z');
    const stored = {
      rateUSD: 0.105,
      source: 'coingecko',
      date: new Date(now.getTime() - 120_000),
    };
    findOneMock.mockReturnValueOnce({ sort: () => ({ lean: () => Promise.resolve(stored) }) });

    const rate = await getCurrentXLMRate(now);
    expect(rate.rateUSD).toBe(0.105);
    expect(rate.stale).toBe(false);
  });

  it('returns the hard-coded fallback rate when cache and DB are both empty', async () => {
    const rate = await getCurrentXLMRate();
    expect(rate.rateUSD).toBe(FALLBACK_RATE_USD);
    expect(rate.source).toBe('fallback');
    expect(rate.stale).toBe(true);
  });
});

describe('getRateForReceipt', () => {
  it('prefers the rate stored on the payment record', async () => {
    const rate = await getRateForReceipt('0.0987');
    expect(rate).toBe('0.0987');
    expect(cacheGet).not.toHaveBeenCalled();
  });

  it('uses the current rate when no stored rate is present', async () => {
    const now = new Date();
    cacheGet.mockResolvedValueOnce({
      rateUSD: 0.13,
      fetchedAt: now.toISOString(),
      source: 'coingecko',
    });
    const rate = await getRateForReceipt();
    expect(rate).toBe('0.13');
  });
});

describe('getCachedRate', () => {
  it('reads the cache under the canonical key', async () => {
    await getCachedRate();
    expect(cacheGet).toHaveBeenCalledWith(RATE_CACHE_KEY);
  });
});
