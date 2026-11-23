import { jest } from '@jest/globals';
import monitorRouter from '../../routes/monitor.js';

jest.mock('../../network-monitor.js', () => ({
  getTransactionBacklog: jest.fn().mockResolvedValue({ pendingTransactions: 10 }),
  checkNetworkAlerts: jest.fn().mockResolvedValue([]),
  getAlertHistory: jest.fn().mockReturnValue([]),
  trackLedgerGrowth: jest.fn().mockResolvedValue({ growth: 0.05 }),
}));

jest.mock('../../logger.js', () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

describe('Monitor Router', () => {
  it('should export a router with monitor endpoints', () => {
    expect(monitorRouter).toBeDefined();
  });
});
