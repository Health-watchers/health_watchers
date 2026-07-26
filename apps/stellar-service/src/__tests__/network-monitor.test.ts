import { jest } from '@jest/globals';
import * as networkMonitor from '../network-monitor.js';

// Mock the Stellar SDK
jest.mock('../stellar.js', () => ({
  getHorizonServer: jest.fn(() => ({
    ledgers: jest.fn(() => ({
      limit: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      call: jest.fn().mockResolvedValue({
        records: [
          {
            sequence: 12345,
            closed_at: '2024-01-01T00:00:00Z',
            base_fee_in_stroops: 100,
            max_tx_set_size: 1000,
            protocol_version: 20,
          },
        ],
      }),
    })),
    transactions: jest.fn(() => ({
      limit: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      call: jest.fn().mockResolvedValue({
        records: Array(50).fill({
          created_at: '2024-01-01T00:00:00Z',
        }),
      }),
    })),
  })),
}));

describe('Network Monitor', () => {
  describe('getLedgerStatus', () => {
    it('should fetch current ledger status', async () => {
      const status = await networkMonitor.getLedgerStatus();
      expect(status).toHaveProperty('ledgerSequence');
      expect(status).toHaveProperty('closeTime');
      expect(status).toHaveProperty('baseFee');
      expect(status).toHaveProperty('maxTxSetSize');
      expect(status).toHaveProperty('protocolVersion');
    });

    it('should have correct ledger sequence', async () => {
      const status = await networkMonitor.getLedgerStatus();
      expect(status.ledgerSequence).toBe(12345);
    });

    it('should have correct protocol version', async () => {
      const status = await networkMonitor.getLedgerStatus();
      expect(status.protocolVersion).toBe(20);
    });
  });

  describe('getTransactionBacklog', () => {
    it('should fetch transaction backlog info', async () => {
      const backlog = await networkMonitor.getTransactionBacklog();
      expect(backlog).toHaveProperty('pendingTransactions');
      expect(backlog).toHaveProperty('averageWaitTime');
      expect(backlog).toHaveProperty('backlogRatio');
      expect(backlog).toHaveProperty('congestionLevel');
    });

    it('should have valid congestion level', async () => {
      const backlog = await networkMonitor.getTransactionBacklog();
      expect(['low', 'moderate', 'high', 'critical']).toContain(backlog.congestionLevel);
    });

    it('should calculate backlog ratio correctly', async () => {
      const backlog = await networkMonitor.getTransactionBacklog();
      expect(backlog.backlogRatio).toBeGreaterThanOrEqual(0);
      expect(backlog.backlogRatio).toBeLessThanOrEqual(1);
    });
  });

  describe('checkNetworkAlerts', () => {
    it('should return array of alerts', async () => {
      const alerts = await networkMonitor.checkNetworkAlerts();
      expect(Array.isArray(alerts)).toBe(true);
    });

    it('should include timestamp in alerts', async () => {
      const alerts = await networkMonitor.checkNetworkAlerts();
      if (alerts.length > 0) {
        expect(alerts[0]).toHaveProperty('timestamp');
        expect(alerts[0].timestamp).toBeTruthy();
      }
    });

    it('should have valid alert levels', async () => {
      const alerts = await networkMonitor.checkNetworkAlerts();
      const validLevels = ['info', 'warning', 'critical'];
      alerts.forEach((alert) => {
        expect(validLevels).toContain(alert.level);
      });
    });

    it('should include alert ID', async () => {
      const alerts = await networkMonitor.checkNetworkAlerts();
      if (alerts.length > 0) {
        expect(alerts[0]).toHaveProperty('id');
        expect(alerts[0].id).toBeTruthy();
      }
    });
  });

  describe('getNetworkStatus', () => {
    it('should return comprehensive network status', async () => {
      const status = await networkMonitor.getNetworkStatus();
      expect(status).toHaveProperty('isHealthy');
      expect(status).toHaveProperty('ledger');
      expect(status).toHaveProperty('backlog');
      expect(status).toHaveProperty('alerts');
      expect(status).toHaveProperty('lastUpdated');
    });

    it('should have boolean isHealthy value', async () => {
      const status = await networkMonitor.getNetworkStatus();
      expect(typeof status.isHealthy).toBe('boolean');
    });

    it('should include alerts array', async () => {
      const status = await networkMonitor.getNetworkStatus();
      expect(Array.isArray(status.alerts)).toBe(true);
    });

    it('should have valid timestamp', async () => {
      const status = await networkMonitor.getNetworkStatus();
      const timestamp = new Date(status.lastUpdated);
      expect(timestamp.getTime()).toBeGreaterThan(0);
    });
  });

  describe('trackLedgerGrowth', () => {
    it('should return ledger growth metrics', async () => {
      const growth = await networkMonitor.trackLedgerGrowth();
      expect(growth).toHaveProperty('ledgersPerSecond');
      expect(growth).toHaveProperty('lastLedger');
    });

    it('should have non-negative ledgers per second', async () => {
      const growth = await networkMonitor.trackLedgerGrowth();
      expect(growth.ledgersPerSecond).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Alert History', () => {
    beforeEach(() => {
      networkMonitor.clearAlertHistory();
    });

    it('should return empty history initially', () => {
      const history = networkMonitor.getAlertHistory();
      expect(history).toEqual([]);
    });

    it('should clear alert history', () => {
      networkMonitor.clearAlertHistory();
      const history = networkMonitor.getAlertHistory();
      expect(history).toEqual([]);
    });
  });

  describe('Network Monitoring', () => {
    it('should start and stop monitoring', (done) => {
      let callCount = 0;
      const callback = () => {
        callCount++;
      };

      const stop = networkMonitor.startNetworkMonitoring(100, callback);

      setTimeout(() => {
        stop();
        expect(callCount).toBeGreaterThan(0);
        done();
      }, 250);
    });
  });
});
