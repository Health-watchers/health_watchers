import { jest } from '@jest/globals';
import logger from '../logger';
import * as stellar from '../stellar';

describe('Logging instrumentation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('logs fundAccount success with details', async () => {
    // Spy on logger.info
    const infoSpy = jest.spyOn(logger as any, 'info');

    (global as any).fetch = jest.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({ hash: 'h1', ledger: 1 }),
    });

    const res = await stellar.fundAccount('GTEST123');

    expect(res.funded).toBe(true);
    expect(infoSpy).toHaveBeenCalled();
    const calledWith = infoSpy.mock.calls.find((c: any) => (c[0] && c[0].operation === 'fundAccount'));
    expect(calledWith).toBeTruthy();
  });

  it('logs createIntent and includes hash on success', async () => {
    const infoSpy = jest.spyOn(logger as any, 'info');

    // Mock Horizon server interactions via existing tests' mocks
    // For simplicity, call createIntent and assert logging occurs (other tests cover behavior)
    const mockLoadAccount = jest.fn().mockResolvedValueOnce({ sequenceNumber: () => '1', accountId: () => 'A' });
    const mockSubmit = jest.fn().mockResolvedValueOnce({ hash: 'tx-hash' });

    jest.unstable_mockModule('@stellar/stellar-sdk', () => {
      const actual = jest.requireActual('@stellar/stellar-sdk') as any;
      return {
        ...actual,
        Horizon: { Server: jest.fn().mockImplementation(() => ({ loadAccount: mockLoadAccount, submitTransaction: mockSubmit, fetchBaseFee: jest.fn().mockResolvedValue('100') })) },
      };
    });

    // Re-import stellar after mocking
    const stellarMod = await import('../stellar');
    const result = await stellarMod.createIntent('GFROM', 'GTO', '1.0');

    expect(result.hash).toBeDefined();
    expect(infoSpy).toHaveBeenCalled();
  });
});
