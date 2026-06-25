/**
 * Unit tests for the XLM rate job tick: metrics updates on success, error
 * counting and staleness flagging on failure.
 */

// ── Module mocks (hoisted before imports) ────────────────────────────────────

jest.mock('../services/xlm-rate.service', () => ({
  refreshXLMRate: jest.fn(),
  getCurrentXLMRate: jest.fn(),
  STALENESS_THRESHOLD_MS: 15 * 60 * 1000,
}));

jest.mock('@api/utils/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

jest.mock('@api/services/metrics.service', () => ({
  xlmRateFetchErrorsTotal: { inc: jest.fn() },
  xlmRateLastValueUsd: { set: jest.fn() },
  xlmRateLastFetchTimestamp: { set: jest.fn() },
  xlmRateStale: { set: jest.fn() },
}));

// ── Imports ───────────────────────────────────────────────────────────────────

import { refreshXLMRate } from '../services/xlm-rate.service';
import {
  xlmRateFetchErrorsTotal,
  xlmRateLastValueUsd,
  xlmRateStale,
} from '@api/services/metrics.service';
import { runRateJobTick, getRateJobStatus, _resetStateForTesting } from '../services/xlm-rate-job';

const refreshMock = refreshXLMRate as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  _resetStateForTesting();
});

describe('runRateJobTick', () => {
  it('updates metrics and marks the rate fresh on success', async () => {
    refreshMock.mockResolvedValueOnce({
      rateUSD: 0.12,
      fetchedAt: new Date().toISOString(),
      source: 'coingecko',
    });

    await runRateJobTick(new Date('2026-05-29T12:00:00Z'));

    expect(xlmRateLastValueUsd.set).toHaveBeenCalledWith(0.12);
    expect(xlmRateStale.set).toHaveBeenCalledWith(0);
    expect(xlmRateFetchErrorsTotal.inc).not.toHaveBeenCalled();
    expect(getRateJobStatus().consecutiveFailures).toBe(0);
  });

  it('counts the error and flags staleness when a fetch has never succeeded', async () => {
    refreshMock.mockRejectedValueOnce(new Error('source down'));

    await runRateJobTick(new Date('2026-05-29T12:00:00Z'));

    expect(xlmRateFetchErrorsTotal.inc).toHaveBeenCalledTimes(1);
    expect(xlmRateStale.set).toHaveBeenCalledWith(1);
    expect(getRateJobStatus().consecutiveFailures).toBe(1);
  });

  it('does not flag staleness immediately after a recent success', async () => {
    refreshMock.mockResolvedValueOnce({
      rateUSD: 0.12,
      fetchedAt: new Date().toISOString(),
      source: 'coingecko',
    });
    await runRateJobTick(new Date('2026-05-29T12:00:00Z'));

    refreshMock.mockRejectedValueOnce(new Error('source down'));
    // 5 minutes later — still within the 15-minute staleness threshold
    await runRateJobTick(new Date('2026-05-29T12:05:00Z'));

    expect(xlmRateStale.set).toHaveBeenLastCalledWith(0);
    expect(getRateJobStatus().consecutiveFailures).toBe(1);
  });

  it('flags staleness once failures exceed the threshold since last success', async () => {
    refreshMock.mockResolvedValueOnce({
      rateUSD: 0.12,
      fetchedAt: new Date().toISOString(),
      source: 'coingecko',
    });
    await runRateJobTick(new Date('2026-05-29T12:00:00Z'));

    refreshMock.mockRejectedValueOnce(new Error('source down'));
    // 16 minutes later — beyond the staleness threshold
    await runRateJobTick(new Date('2026-05-29T12:16:00Z'));

    expect(xlmRateStale.set).toHaveBeenLastCalledWith(1);
  });
});
