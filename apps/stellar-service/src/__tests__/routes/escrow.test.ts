import { jest } from '@jest/globals';
import escrowRouter from '../../routes/escrow.js';

jest.mock('../../stellar.js', () => ({
  getHorizonServer: jest.fn(),
  getNetworkPassphrase: jest.fn().mockReturnValue('Test SDF Network ; September 2015'),
}));

jest.mock('../../operations/escrow.js', () => ({
  createEscrow: jest.fn(),
  claimEscrow: jest.fn(),
  refundEscrow: jest.fn(),
  getClaimableBalances: jest.fn(),
  getClaimableBalanceById: jest.fn(),
}));

jest.mock('../../error-handler.js', () => ({
  parseHorizonError: jest.fn().mockReturnValue({ statusCode: 500, error: 'Internal error' }),
}));

jest.mock('../../logger.js', () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

describe('Escrow Router', () => {
  it('should export a router with escrow endpoints', () => {
    expect(escrowRouter).toBeDefined();
  });
});
