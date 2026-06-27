import { jest } from '@jest/globals';
import logger from '../logger';

// Mock Horizon server so no real network calls are made.
const mockFeeStats = jest.fn<any>();

jest.mock('@stellar/stellar-sdk', () => {
  const actual = jest.requireActual('@stellar/stellar-sdk') as any;
  return {
    ...actual,
    Horizon: {
      ...actual.Horizon,
      Server: jest.fn().mockImplementation(() => ({
        feeStats: mockFeeStats,
      })),
    },
  };
});

import * as stellar from '../stellar';

type Call = [Record<string, any>, string?];

describe('Stellar logging context', () => {
  let infoSpy: any;
  let errorSpy: any;
  let debugSpy: any;

  beforeEach(() => {
    jest.clearAllMocks();
    infoSpy = jest.spyOn(logger as any, 'info');
    errorSpy = jest.spyOn(logger as any, 'error');
    debugSpy = jest.spyOn(logger as any, 'debug');
  });

  it('logs the operation outcome and Horizon request/response for a successful call', async () => {
    mockFeeStats.mockResolvedValueOnce({
      fee_charged: {
        min: '100',
        mode: '100',
        max: '10000',
        p10: '100',
        p50: '200',
        p90: '500',
        p99: '1000',
      },
    });

    await stellar.getFeeStats();

    // Operation-level structured log with explicit outcome + timing.
    const opLog = (infoSpy.mock.calls as Call[]).find(
      (c) => c[0]?.operation === 'getFeeStats' && c[0]?.outcome === 'success'
    );
    expect(opLog).toBeTruthy();
    expect(typeof opLog![0].durationMs).toBe('number');

    // Horizon request + response are both logged with timing.
    const reqLog = (debugSpy.mock.calls as Call[]).find(
      (c) => c[0]?.horizonOp === 'feeStats' && c[0]?.phase === 'request'
    );
    const resLog = (debugSpy.mock.calls as Call[]).find(
      (c) =>
        c[0]?.horizonOp === 'feeStats' && c[0]?.phase === 'response' && c[0]?.outcome === 'success'
    );
    expect(reqLog).toBeTruthy();
    expect(resLog).toBeTruthy();
    expect(typeof resLog![0].durationMs).toBe('number');
  });

  it('logs full error context (status, Horizon result codes) with outcome=failure', async () => {
    mockFeeStats.mockRejectedValueOnce({
      message: 'Service unavailable',
      response: {
        status: 503,
        data: { extras: { result_codes: { transaction: 'tx_insufficient_fee' } }, detail: 'boom' },
      },
    });

    await expect(stellar.getFeeStats()).rejects.toBeTruthy();

    const failLog = (errorSpy.mock.calls as Call[]).find(
      (c) => c[0]?.horizonOp === 'feeStats' && c[0]?.outcome === 'failure'
    );
    expect(failLog).toBeTruthy();
    expect(failLog![0].error.message).toBe('Service unavailable');
    expect(failLog![0].error.status).toBe(503);
    expect(failLog![0].error.horizonResultCodes).toEqual({ transaction: 'tx_insufficient_fee' });
    expect(typeof failLog![0].durationMs).toBe('number');
  });
});
