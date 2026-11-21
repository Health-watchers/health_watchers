import { jest } from '@jest/globals';
import reconcileRouter from '../../routes/reconcile.js';

jest.mock('../../payment-reconciliation.js', () => ({
  runReconciliation: jest.fn().mockResolvedValue({ matched: 10, unmatched: 2 }),
  getReconciliationHistory: jest.fn().mockReturnValue([]),
  getReconciliationStatistics: jest.fn().mockReturnValue({ total: 0 }),
  clearReconciliationHistory: jest.fn(),
}));

jest.mock('../../logger.js', () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

describe('Reconcile Router', () => {
  it('should export a router with reconcile endpoints', () => {
    expect(reconcileRouter).toBeDefined();
  });
});
