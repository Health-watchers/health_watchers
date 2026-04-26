/**
 * Tests for connectDB retry logic.
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
