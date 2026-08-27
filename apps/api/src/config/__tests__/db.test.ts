/**
 * Tests for connectDB retry logic, pool metrics, and monitoring lifecycle.
 * Mocks mongoose.connect to fail N times then succeed.
 */

jest.mock('mongoose', () => {
  const actual = jest.requireActual('mongoose');
  return {
    ...actual,
    connect: jest.fn(),
    connection: {
      ...actual.connection,
      readyState: 1,
      on: jest.fn(),
      pool: {
        totalConnectionCount: 5,
        availableConnectionCount: 3,
        waitQueueSize: 0,
      },
    },
  };
});

jest.mock('@health-watchers/config', () => ({
  config: { mongoUri: 'mongodb://localhost:27017/test' },
}));

jest.mock('../../utils/logger', () => ({
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import mongoose from 'mongoose';

// Speed up retries in tests
jest.useFakeTimers();

describe('connectDB retry logic', () => {
  const mockConnect = mongoose.connect as jest.Mock;

  beforeEach(() => {
    mockConnect.mockReset();
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.clearAllTimers();
  });

  it('connects on first attempt', async () => {
    mockConnect.mockResolvedValueOnce(undefined);

    // Re-import to get fresh module
    jest.resetModules();
    const { connectDB } = await import('../config/db');

    const promise = connectDB();
    await promise;

    expect(mockConnect).toHaveBeenCalledTimes(1);
  });

  it('retries on failure and succeeds on 3rd attempt', async () => {
    mockConnect
      .mockRejectedValueOnce(new Error('ECONNREFUSED'))
      .mockRejectedValueOnce(new Error('ECONNREFUSED'))
      .mockResolvedValueOnce(undefined);

    jest.resetModules();
    const { connectDB } = await import('../config/db');

    const promise = connectDB();

    // Advance timers for retry delays (1s + 2s)
    await jest.runAllTimersAsync();
    await promise;

    expect(mockConnect).toHaveBeenCalledTimes(3);
  });
});

describe('getDbStatus', () => {
  it('returns connected when readyState is 1', async () => {
    jest.resetModules();
    const { getDbStatus } = await import('../config/db');
    expect(getDbStatus()).toBe('connected');
  });
});

describe('getPoolMetrics', () => {
  it('returns pool metrics with correct shape', async () => {
    jest.resetModules();
    const { getPoolMetrics } = await import('../config/db');
    const metrics = getPoolMetrics();

    expect(metrics).toMatchObject({
      status: expect.stringMatching(/^(connected|disconnected|connecting|disconnecting)$/),
      totalConnections: expect.any(Number),
      availableConnections: expect.any(Number),
      waitQueueSize: expect.any(Number),
      maxPoolSize: expect.any(Number),
      minPoolSize: expect.any(Number),
      utilization: expect.any(Number),
    });
  });

  it('utilization is between 0 and 1 when pool is populated', async () => {
    jest.resetModules();
    const { getPoolMetrics } = await import('../config/db');
    const metrics = getPoolMetrics();
    expect(metrics.utilization).toBeGreaterThanOrEqual(0);
    expect(metrics.utilization).toBeLessThanOrEqual(1);
  });

  it('returns zero utilization when pool data is unavailable', async () => {
    jest.resetModules();
    // Temporarily override pool to be undefined
    (mongoose.connection as any).pool = undefined;
    const { getPoolMetrics } = await import('../config/db');
    const metrics = getPoolMetrics();
    expect(metrics.totalConnections).toBe(0);
    expect(metrics.availableConnections).toBe(0);
    expect(metrics.waitQueueSize).toBe(0);
    // Restore
    (mongoose.connection as any).pool = {
      totalConnectionCount: 5,
      availableConnectionCount: 3,
      waitQueueSize: 0,
    };
  });
});

describe('stopPoolMonitoring', () => {
  it('can be called without error when monitoring is not active', async () => {
    jest.resetModules();
    const { stopPoolMonitoring } = await import('../config/db');
    expect(() => stopPoolMonitoring()).not.toThrow();
  });

  it('is exported as a function', async () => {
    jest.resetModules();
    const mod = await import('../config/db');
    expect(typeof mod.stopPoolMonitoring).toBe('function');
  });
});
