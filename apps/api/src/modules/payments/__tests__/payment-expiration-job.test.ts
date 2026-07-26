/**
 * Unit tests for the payment expiration job's error handling, retry logic,
 * metrics updates, and state tracking.
 *
 * All external dependencies (MongoDB model, logger, metrics) are mocked —
 * no real DB or network connections.
 */

// ── Module mocks (hoisted before imports) ────────────────────────────────────

jest.mock('@api/modules/payments/models/payment-record.model', () => ({
  PaymentRecordModel: {
    updateMany: jest.fn(),
  },
}));

jest.mock('@api/utils/logger', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

jest.mock('@api/services/metrics.service', () => ({
  paymentExpirationJobErrorsTotal: { inc: jest.fn() },
  paymentExpirationJobLastRunExpired: { set: jest.fn() },
  paymentExpirationJobLastSuccessTimestamp: { set: jest.fn() },
  paymentExpirationJobConsecutiveFailures: { set: jest.fn() },
}));

// ── Imports ───────────────────────────────────────────────────────────────────

import { PaymentRecordModel } from '../models/payment-record.model';
import logger from '@api/utils/logger';
import {
  paymentExpirationJobErrorsTotal,
  paymentExpirationJobLastRunExpired,
  paymentExpirationJobLastSuccessTimestamp,
  paymentExpirationJobConsecutiveFailures,
} from '@api/services/metrics.service';
import {
  runExpirationJobTick,
  expirePendingPayments,
  getJobStatus,
  _resetStateForTesting,
  calculateExpiryDate,
} from '../services/payment-expiration-job';

const updateManyMock = PaymentRecordModel.updateMany as jest.Mock;

// ── Test helpers ─────────────────────────────────────────────────────────────

function makeTransientError(name = 'MongoNetworkError'): Error {
  return Object.assign(new Error(`${name}: connection lost`), { name });
}

// ── Lifecycle ─────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  _resetStateForTesting();
});

// ─────────────────────────────────────────────────────────────────────────────
// runExpirationJobTick — error handling
// ─────────────────────────────────────────────────────────────────────────────

describe('runExpirationJobTick — error handling', () => {
  it('does NOT throw when MongoDB is unavailable', async () => {
    updateManyMock.mockRejectedValue(new Error('ECONNREFUSED'));
    await expect(runExpirationJobTick()).resolves.toBeUndefined();
  });

  it('logs a structured error with job context on failure', async () => {
    updateManyMock.mockRejectedValue(new Error('DB down'));
    await runExpirationJobTick();

    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ job: 'payment-expiration-job', consecutiveFailures: 1 }),
      expect.any(String)
    );
  });

  it('increments paymentExpirationJobErrorsTotal counter on failure', async () => {
    updateManyMock.mockRejectedValue(new Error('DB down'));
    await runExpirationJobTick();
    expect(paymentExpirationJobErrorsTotal.inc).toHaveBeenCalledTimes(1);
  });

  it('sets consecutive failures gauge on failure', async () => {
    updateManyMock.mockRejectedValue(new Error('DB down'));
    await runExpirationJobTick();
    expect(paymentExpirationJobConsecutiveFailures.set).toHaveBeenCalledWith(1);
  });

  it('accumulates consecutiveFailures across multiple failures', async () => {
    updateManyMock.mockRejectedValue(new Error('DB down'));
    await runExpirationJobTick();
    await runExpirationJobTick();
    expect(getJobStatus().consecutiveFailures).toBe(2);
    expect(paymentExpirationJobConsecutiveFailures.set).toHaveBeenLastCalledWith(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// runExpirationJobTick — success path
// ─────────────────────────────────────────────────────────────────────────────

describe('runExpirationJobTick — success path', () => {
  it('sets paymentExpirationJobLastRunExpired gauge with expired count', async () => {
    updateManyMock.mockResolvedValue({ modifiedCount: 7 });
    await runExpirationJobTick();
    expect(paymentExpirationJobLastRunExpired.set).toHaveBeenCalledWith(7);
  });

  it('sets paymentExpirationJobLastSuccessTimestamp gauge after success', async () => {
    const before = Date.now() / 1000;
    updateManyMock.mockResolvedValue({ modifiedCount: 0 });
    await runExpirationJobTick();
    const [[ts]] = (paymentExpirationJobLastSuccessTimestamp.set as jest.Mock).mock.calls;
    expect(ts).toBeGreaterThanOrEqual(before);
  });

  it('updates lastSuccessfulRunAt state after success', async () => {
    const before = new Date();
    updateManyMock.mockResolvedValue({ modifiedCount: 0 });
    await runExpirationJobTick();
    expect(getJobStatus().lastSuccessfulRunAt).not.toBeNull();
    expect(getJobStatus().lastSuccessfulRunAt!.getTime()).toBeGreaterThanOrEqual(before.getTime());
  });

  it('resets consecutiveFailures to 0 after a successful run following failures', async () => {
    updateManyMock.mockRejectedValueOnce(new Error('DB down'));
    await runExpirationJobTick();
    expect(getJobStatus().consecutiveFailures).toBe(1);

    updateManyMock.mockResolvedValue({ modifiedCount: 0 });
    await runExpirationJobTick();
    expect(getJobStatus().consecutiveFailures).toBe(0);
    expect(paymentExpirationJobConsecutiveFailures.set).toHaveBeenLastCalledWith(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// expirePendingPayments — exponential backoff retry
// ─────────────────────────────────────────────────────────────────────────────

describe('expirePendingPayments — exponential backoff retry', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('retries on a transient MongoNetworkError and eventually succeeds', async () => {
    updateManyMock
      .mockRejectedValueOnce(makeTransientError('MongoNetworkError'))
      .mockResolvedValue({ modifiedCount: 3 });

    const promise = expirePendingPayments();
    await jest.runAllTimersAsync();
    const count = await promise;

    expect(updateManyMock).toHaveBeenCalledTimes(2);
    expect(count).toBe(3);
  });

  it('retries on MongoTopologyClosedError', async () => {
    updateManyMock
      .mockRejectedValueOnce(makeTransientError('MongoTopologyClosedError'))
      .mockResolvedValue({ modifiedCount: 0 });

    const promise = expirePendingPayments();
    await jest.runAllTimersAsync();
    await promise;

    expect(updateManyMock).toHaveBeenCalledTimes(2);
  });

  it('retries on ECONNREFUSED message', async () => {
    const err = new Error('connect ECONNREFUSED 127.0.0.1:27017');
    updateManyMock.mockRejectedValueOnce(err).mockResolvedValue({ modifiedCount: 0 });

    const promise = expirePendingPayments();
    await jest.runAllTimersAsync();
    await promise;

    expect(updateManyMock).toHaveBeenCalledTimes(2);
  });

  it('does NOT retry on non-transient errors', async () => {
    const nonTransient = new Error('ValidationError: invalid field');
    updateManyMock.mockRejectedValue(nonTransient);

    const promise = expirePendingPayments();
    await jest.runAllTimersAsync();
    await expect(promise).rejects.toThrow('ValidationError');

    // Only 1 attempt — no retry
    expect(updateManyMock).toHaveBeenCalledTimes(1);
  });

  it('throws after exhausting all retries for persistent transient errors', async () => {
    updateManyMock.mockRejectedValue(makeTransientError('MongoNetworkError'));

    const promise = expirePendingPayments();
    await jest.runAllTimersAsync();
    await expect(promise).rejects.toThrow();

    // 1 initial + 3 retries = 4 calls total
    expect(updateManyMock).toHaveBeenCalledTimes(4);
  });

  it('logs a warning with retry context on each transient retry', async () => {
    updateManyMock
      .mockRejectedValueOnce(makeTransientError('MongoNetworkError'))
      .mockResolvedValue({ modifiedCount: 0 });

    const promise = expirePendingPayments();
    await jest.runAllTimersAsync();
    await promise;

    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ attempt: 0, retryInMs: expect.any(Number) }),
      expect.any(String)
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// getJobStatus
// ─────────────────────────────────────────────────────────────────────────────

describe('getJobStatus', () => {
  it('returns null lastSuccessfulRunAt before any tick runs', () => {
    expect(getJobStatus().lastSuccessfulRunAt).toBeNull();
  });

  it('returns 0 consecutiveFailures on fresh state', () => {
    expect(getJobStatus().consecutiveFailures).toBe(0);
  });

  it('reflects running=false when the job is not started', () => {
    expect(getJobStatus().running).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// calculateExpiryDate
// ─────────────────────────────────────────────────────────────────────────────

describe('calculateExpiryDate', () => {
  it('defaults to 24 hours for immediate payments', () => {
    const expiry = calculateExpiryDate('immediate');
    const diff = expiry.getTime() - Date.now();
    expect(diff).toBeGreaterThan(23 * 60 * 60 * 1000);
    expect(diff).toBeLessThanOrEqual(24 * 60 * 60 * 1000 + 100);
  });

  it('returns 24 hours for multisig payments', () => {
    const expiry = calculateExpiryDate('multisig');
    const diff = expiry.getTime() - Date.now();
    expect(diff).toBeGreaterThan(23 * 60 * 60 * 1000);
  });

  it('returns 30 days for escrow payments', () => {
    const expiry = calculateExpiryDate('escrow');
    const diff = expiry.getTime() - Date.now();
    expect(diff).toBeGreaterThan(29 * 24 * 60 * 60 * 1000);
  });
});
