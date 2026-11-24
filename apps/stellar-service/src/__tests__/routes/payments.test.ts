import { jest } from '@jest/globals';
import paymentsRouter from '../../routes/payments.js';

jest.mock('../../stellar.js', () => ({
  fundAccount: jest.fn(),
  createIntent: jest.fn(),
  verifyIntent: jest.fn(),
  getAccountBalance: jest.fn(),
  createUsdcTrustline: jest.fn(),
  findPaths: jest.fn(),
  getOrderbook: jest.fn(),
  getFeeStats: jest.fn(),
  buildFeeBumpTransaction: jest.fn(),
  issueRefund: jest.fn(),
  anchorDigest: jest.fn(),
  getNetworkPassphrase: jest.fn().mockReturnValue('Test SDF Network ; September 2015'),
  buildMultiSigTransaction: jest.fn(),
  addCoSignerSignature: jest.fn(),
  submitMultiSigTransaction: jest.fn(),
  processBatchPayments: jest.fn(),
  getHorizonServer: jest.fn(),
}));

jest.mock('../../operations/claimable-balance.js', () => ({
  createClaimableBalance: jest.fn(),
  claimClaimableBalance: jest.fn(),
}));

jest.mock('../../operations/escrow.js', () => ({
  createEscrow: jest.fn(),
  claimEscrow: jest.fn(),
  refundEscrow: jest.fn(),
  getClaimableBalances: jest.fn(),
  getClaimableBalanceById: jest.fn(),
}));

jest.mock('../../payment-state-machine.js', () => ({
  paymentStateMachine: {
    canTransition: jest.fn().mockReturnValue(true),
    createPayment: jest.fn(),
    transition: jest.fn(),
    rollback: jest.fn(),
    getStateHistory: jest.fn().mockReturnValue([]),
  },
  PaymentState: { PENDING: 'PENDING', SUBMITTED: 'SUBMITTED', CONFIRMED: 'CONFIRMED', FAILED: 'FAILED', ROLLED_BACK: 'ROLLED_BACK' },
}));

jest.mock('../../exchange-rates.js', () => ({
  exchangeRateManager: {
    getCachedRates: jest.fn().mockReturnValue([]),
    getMultipleRates: jest.fn().mockResolvedValue([]),
    refreshRate: jest.fn().mockResolvedValue({}),
    clearCache: jest.fn(),
    startPeriodicRefresh: jest.fn(),
    stopPeriodicRefresh: jest.fn(),
  },
  refreshAllRates: jest.fn(),
}));

jest.mock('../../mainnet-safety.js', () => ({
  mainnetSafetyManager: {
    performSafetyCheck: jest.fn().mockReturnValue({ passed: true }),
    detectNetworkConsistency: jest.fn().mockReturnValue({ passed: true }),
    getNetwork: jest.fn().mockReturnValue('testnet'),
    isMainnet: jest.fn().mockReturnValue(false),
    validateAmount: jest.fn().mockReturnValue({ passed: true }),
    recordConfirmation: jest.fn(),
    getConfirmationState: jest.fn().mockReturnValue({ confirmed: false }),
  },
}));

jest.mock('../../payment-reconciliation.js', () => ({
  runReconciliation: jest.fn(),
  PaymentRecord: jest.fn(),
}));

jest.mock('../../batch-processor.js', () => ({
  batchProcessor: {
    enqueue: jest.fn().mockResolvedValue({ jobId: 'test' }),
    getJob: jest.fn().mockReturnValue(null),
    cancelJob: jest.fn().mockReturnValue(false),
    flush: jest.fn().mockResolvedValue(undefined),
    getStats: jest.fn().mockReturnValue({}),
    getQueueSnapshot: jest.fn().mockReturnValue([]),
    getCompletedJobs: jest.fn().mockReturnValue([]),
    startAutoFlush: jest.fn(),
    stopAutoFlush: jest.fn(),
  },
}));

jest.mock('../../logger.js', () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

jest.mock('../../error-handler.js', () => ({
  parseHorizonError: jest.fn().mockReturnValue({ statusCode: 500, error: 'Internal error' }),
}));

describe('Payments Router', () => {
  it('should export a router with payments endpoints', () => {
    expect(paymentsRouter).toBeDefined();
  });
});
