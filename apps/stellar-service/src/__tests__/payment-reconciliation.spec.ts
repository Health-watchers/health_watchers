import {
  PaymentRecord,
  LedgerTransaction,
  ReconciliationMatch,
  ReconciliationReport,
  fetchLedgerTransactions,
  matchPayments,
  generateReconciliationReport,
  runReconciliation,
  recordResolution,
  getReconciliationHistory,
  getReconciliationStatistics,
  clearReconciliationHistory,
} from '../payment-reconciliation';

/**
 * Mock Horizon API client
 * Simulates Stellar testnet responses for deterministic testing
 */

// Mock the Stellar module
jest.mock('../stellar.js', () => ({
  getHorizonServer: jest.fn(),
}));

jest.mock('../logger.js', () => ({
  __esModule: true,
  default: {
    debug: jest.fn(),
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  },
}));

import { getHorizonServer } from '../stellar.js';
import logger from '../logger.js';

describe('Payment Reconciliation Service', () => {
  const mockHorizonServer = {
    payments: jest.fn(),
  };

  const testAccountAddress = 'GBBD47UZQ52COEMNUYF4KDCOL2O7ZCZTCapplicwemf52XLMRWCVTUY7K';

  beforeEach(() => {
    jest.clearAllMocks();
    clearReconciliationHistory();
    (getHorizonServer as jest.Mock).mockReturnValue(mockHorizonServer);
  });

  describe('fetchLedgerTransactions', () => {
    it('should fetch and transform ledger transactions from Horizon API', async () => {
      const mockPayments = {
        records: [
          {
            id: '1234567890',
            type: 'payment',
            transaction_hash: 'abc123def456',
            from: testAccountAddress,
            to: 'GBRPYHIL2CI3WHZDTOOQFC6EB4RRJC3D5NJ7QA5AEUNX2RRZGSWWS5L',
            amount: '100.0000000',
            asset_type: 'native',
            created_at: '2024-01-15T10:30:00Z',
            memo: 'payment-001',
          },
          {
            id: '1234567891',
            type: 'create_account',
            transaction_hash: 'abc123def457',
            funder: testAccountAddress,
            account: 'GBRPYHIL2CI3WHZDTOOQFC6EB4RRJC3D5NJ7QA5AEUNX2RRZGSWWS5L',
            starting_balance: '50.0000000',
            created_at: '2024-01-14T10:30:00Z',
          },
        ],
      };

      const mockPaymentsApi = {
        forAccount: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        call: jest.fn().mockResolvedValue(mockPayments),
      };

      (mockHorizonServer.payments as jest.Mock).mockReturnValue(mockPaymentsApi);

      const result = await fetchLedgerTransactions(testAccountAddress, 200);

      expect(mockPaymentsApi.forAccount).toHaveBeenCalledWith(testAccountAddress);
      expect(mockPaymentsApi.limit).toHaveBeenCalledWith(200);
      expect(mockPaymentsApi.order).toHaveBeenCalledWith('desc');
      expect(mockPaymentsApi.call).toHaveBeenCalled();

      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({
        id: '1234567890',
        hash: 'abc123def456',
        fromAddress: testAccountAddress,
        toAddress: 'GBRPYHIL2CI3WHZDTOOQFC6EB4RRJC3D5NJ7QA5AEUNX2RRZGSWWS5L',
        amount: '100.0000000',
        asset: 'XLM',
        timestamp: '2024-01-15T10:30:00Z',
        memo: 'payment-001',
        type: 'payment',
      });

      expect(result[1]).toMatchObject({
        id: '1234567891',
        hash: 'abc123def457',
        asset: 'XLM',
        type: 'create_account',
      });

      expect(logger.debug).toHaveBeenCalledWith(
        expect.objectContaining({
          accountAddress: testAccountAddress,
          fetchedTransactions: 2,
        }),
        'Fetched ledger transactions'
      );
    });

    it('should handle Horizon API errors gracefully', async () => {
      const mockPaymentsApi = {
        forAccount: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        call: jest.fn().mockRejectedValue(new Error('Horizon API unreachable')),
      };

      (mockHorizonServer.payments as jest.Mock).mockReturnValue(mockPaymentsApi);

      await expect(fetchLedgerTransactions(testAccountAddress)).rejects.toThrow(
        'Horizon API unreachable'
      );

      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          accountAddress: testAccountAddress,
          error: 'Horizon API unreachable',
        }),
        'Failed to fetch ledger transactions'
      );
    });

    it('should return empty array when no transactions found', async () => {
      const mockPaymentsApi = {
        forAccount: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        call: jest.fn().mockResolvedValue({ records: [] }),
      };

      (mockHorizonServer.payments as jest.Mock).mockReturnValue(mockPaymentsApi);

      const result = await fetchLedgerTransactions(testAccountAddress);

      expect(result).toHaveLength(0);
    });
  });

  describe('matchPayments', () => {
    const mockLedgerTransactions: LedgerTransaction[] = [
      {
        id: '1',
        hash: 'hash1',
        fromAddress: 'GAAAA',
        toAddress: 'GBBBB',
        amount: '100.0000000',
        asset: 'XLM',
        timestamp: '2024-01-15T10:00:00Z',
        type: 'payment',
      },
      {
        id: '2',
        hash: 'hash2',
        fromAddress: 'GAAAA',
        toAddress: 'GCCCC',
        amount: '50.0000000',
        asset: 'XLM',
        timestamp: '2024-01-15T11:00:00Z',
        type: 'payment',
      },
      {
        id: '3',
        hash: 'hash3',
        fromAddress: 'GAAAA',
        toAddress: 'GDDDD',
        amount: '25.0000000',
        asset: 'XLM',
        timestamp: '2024-01-15T12:00:00Z',
        type: 'payment',
      },
    ];

    it('should successfully match a single perfect payment', () => {
      const expectedPayments: PaymentRecord[] = [
        {
          id: 'exp1',
          fromAddress: 'GAAAA',
          toAddress: 'GBBBB',
          amount: '100.0000000',
          asset: 'XLM',
          timestamp: '2024-01-15T10:00:00Z',
          status: 'success',
        },
      ];

      const matches = matchPayments(expectedPayments, mockLedgerTransactions);

      expect(matches).toHaveLength(1);
      expect(matches[0]).toMatchObject({
        matched: true,
        discrepancies: [],
      });
      expect(matches[0].expectedPayment).toEqual(expectedPayments[0]);
      expect(matches[0].ledgerTransaction).toEqual(mockLedgerTransactions[0]);
    });

    it('should identify payment not found on ledger', () => {
      const expectedPayments: PaymentRecord[] = [
        {
          id: 'exp1',
          fromAddress: 'GAAAA',
          toAddress: 'GZZZZ',
          amount: '999.0000000',
          asset: 'XLM',
          timestamp: '2024-01-15T13:00:00Z',
          status: 'success',
        },
      ];

      const matches = matchPayments(expectedPayments, mockLedgerTransactions);

      expect(matches).toHaveLength(1);
      expect(matches[0]).toMatchObject({
        matched: false,
        discrepancies: ['No matching ledger transaction found'],
      });
      expect(matches[0].ledgerTransaction).toEqual({} as LedgerTransaction);
    });

    it('should handle amount variance within tolerance', () => {
      const expectedPayments: PaymentRecord[] = [
        {
          id: 'exp1',
          fromAddress: 'GAAAA',
          toAddress: 'GBBBB',
          amount: '100.1', // 0.1 difference
          asset: 'XLM',
          timestamp: '2024-01-15T10:00:00Z',
          status: 'success',
        },
      ];

      const tolerance = { amountVariance: 1, timeWindow: 3600000 }; // 1% variance allowed

      const matches = matchPayments(expectedPayments, mockLedgerTransactions, tolerance);

      expect(matches).toHaveLength(1);
      expect(matches[0].matched).toBe(true);
    });

    it('should detect amount mismatches outside tolerance', () => {
      const expectedPayments: PaymentRecord[] = [
        {
          id: 'exp1',
          fromAddress: 'GAAAA',
          toAddress: 'GBBBB',
          amount: '95.0000000', // 5% difference
          asset: 'XLM',
          timestamp: '2024-01-15T10:00:00Z',
          status: 'success',
        },
      ];

      const tolerance = { amountVariance: 1, timeWindow: 3600000 }; // 1% tolerance

      const matches = matchPayments(expectedPayments, mockLedgerTransactions, tolerance);

      expect(matches).toHaveLength(1);
      expect(matches[0].matched).toBe(false);
      expect(matches[0].discrepancies.some((d) => d.includes('Amount mismatch'))).toBe(true);
    });

    it('should handle timestamp variance within time window', () => {
      const expectedPayments: PaymentRecord[] = [
        {
          id: 'exp1',
          fromAddress: 'GAAAA',
          toAddress: 'GBBBB',
          amount: '100.0000000',
          asset: 'XLM',
          timestamp: '2024-01-15T10:15:00Z', // 15 minutes later
          status: 'success',
        },
      ];

      const tolerance = { amountVariance: 0.01, timeWindow: 3600000 }; // 1 hour window

      const matches = matchPayments(expectedPayments, mockLedgerTransactions, tolerance);

      expect(matches).toHaveLength(1);
      expect(matches[0].matched).toBe(true);
    });

    it('should detect timestamp mismatches outside time window', () => {
      const expectedPayments: PaymentRecord[] = [
        {
          id: 'exp1',
          fromAddress: 'GAAAA',
          toAddress: 'GBBBB',
          amount: '100.0000000',
          asset: 'XLM',
          timestamp: '2024-01-15T11:30:00Z', // 1.5 hours later
          status: 'success',
        },
      ];

      const tolerance = { amountVariance: 0.01, timeWindow: 3600000 }; // 1 hour window

      const matches = matchPayments(expectedPayments, mockLedgerTransactions, tolerance);

      expect(matches).toHaveLength(1);
      expect(matches[0].matched).toBe(false);
      expect(matches[0].discrepancies.some((d) => d.includes('Timestamp mismatch'))).toBe(true);
    });

    it('should prevent duplicate matching of ledger transactions', () => {
      const expectedPayments: PaymentRecord[] = [
        {
          id: 'exp1',
          fromAddress: 'GAAAA',
          toAddress: 'GBBBB',
          amount: '100.0000000',
          asset: 'XLM',
          timestamp: '2024-01-15T10:00:00Z',
          status: 'success',
        },
        {
          id: 'exp2',
          fromAddress: 'GAAAA',
          toAddress: 'GBBBB',
          amount: '100.0000000',
          asset: 'XLM',
          timestamp: '2024-01-15T10:00:00Z',
          status: 'success',
        },
      ];

      const matches = matchPayments(expectedPayments, mockLedgerTransactions);

      expect(matches).toHaveLength(2);
      // Only first should match
      expect(matches[0].matched).toBe(true);
      expect(matches[1].matched).toBe(false);
    });
  });

  describe('generateReconciliationReport', () => {
    it('should generate a report with successful matches', () => {
      const expectedPayment: PaymentRecord = {
        id: 'exp1',
        fromAddress: 'GAAAA',
        toAddress: 'GBBBB',
        amount: '100.0000000',
        asset: 'XLM',
        timestamp: '2024-01-15T10:00:00Z',
        status: 'success',
      };

      const ledgerTransaction: LedgerTransaction = {
        id: '1',
        hash: 'hash1',
        fromAddress: 'GAAAA',
        toAddress: 'GBBBB',
        amount: '100.0000000',
        asset: 'XLM',
        timestamp: '2024-01-15T10:00:00Z',
        type: 'payment',
      };

      const matches: ReconciliationMatch[] = [
        {
          expectedPayment,
          ledgerTransaction,
          matched: true,
          discrepancies: [],
        },
      ];

      const report = generateReconciliationReport(matches, [ledgerTransaction]);

      expect(report).toMatchObject({
        totalExpected: 1,
        totalMatched: 1,
        totalDiscrepancies: 0,
        matchPercentage: 100,
      });
      expect(report.discrepancies).toHaveLength(0);
      expect(report.unmatched.expected).toHaveLength(0);
      expect(report.unmatched.ledger).toHaveLength(0);
    });

    it('should report missing payments', () => {
      const expectedPayment: PaymentRecord = {
        id: 'exp1',
        fromAddress: 'GAAAA',
        toAddress: 'GZZZZ',
        amount: '999.0000000',
        asset: 'XLM',
        timestamp: '2024-01-15T10:00:00Z',
        status: 'success',
      };

      const matches: ReconciliationMatch[] = [
        {
          expectedPayment,
          ledgerTransaction: {} as LedgerTransaction,
          matched: false,
          discrepancies: ['No matching ledger transaction found'],
        },
      ];

      const report = generateReconciliationReport(matches, []);

      expect(report).toMatchObject({
        totalExpected: 1,
        totalMatched: 0,
        totalDiscrepancies: 1,
        matchPercentage: 0,
      });
      expect(report.discrepancies).toHaveLength(1);
      expect(report.discrepancies[0]).toMatchObject({
        type: 'missing_payment',
        severity: 'high',
      });
      expect(report.unmatched.expected).toContain(expectedPayment);
    });

    it('should report unexpected ledger transactions', () => {
      const ledgerTransaction: LedgerTransaction = {
        id: '1',
        hash: 'hash1',
        fromAddress: 'GAAAA',
        toAddress: 'GZZZZ',
        amount: '500.0000000',
        asset: 'XLM',
        timestamp: '2024-01-15T10:00:00Z',
        type: 'payment',
      };

      const matches: ReconciliationMatch[] = [];

      const report = generateReconciliationReport(matches, [ledgerTransaction]);

      expect(report).toMatchObject({
        totalExpected: 0,
        totalMatched: 0,
        totalDiscrepancies: 1,
      });
      expect(report.discrepancies).toHaveLength(1);
      expect(report.discrepancies[0]).toMatchObject({
        type: 'missing_ledger',
        severity: 'medium',
      });
      expect(report.unmatched.ledger).toContain(ledgerTransaction);
    });

    it('should report partial matches with discrepancies', () => {
      const expectedPayment: PaymentRecord = {
        id: 'exp1',
        fromAddress: 'GAAAA',
        toAddress: 'GBBBB',
        amount: '100.0000000',
        asset: 'XLM',
        timestamp: '2024-01-15T10:00:00Z',
        status: 'success',
      };

      const ledgerTransaction: LedgerTransaction = {
        id: '1',
        hash: 'hash1',
        fromAddress: 'GAAAA',
        toAddress: 'GBBBB',
        amount: '95.0000000',
        asset: 'XLM',
        timestamp: '2024-01-15T10:00:00Z',
        type: 'payment',
      };

      const matches: ReconciliationMatch[] = [
        {
          expectedPayment,
          ledgerTransaction,
          matched: false,
          discrepancies: ['Amount mismatch: 100 vs 95'],
        },
      ];

      const report = generateReconciliationReport(matches, [ledgerTransaction]);

      expect(report.totalDiscrepancies).toBeGreaterThan(0);
      expect(report.discrepancies[0]).toMatchObject({
        type: 'amount_mismatch',
        severity: 'medium',
      });
    });

    it('should store report in history', () => {
      const matches: ReconciliationMatch[] = [];
      const report1 = generateReconciliationReport(matches, []);
      const report2 = generateReconciliationReport(matches, []);

      const history = getReconciliationHistory(10);

      expect(history).toHaveLength(2);
      expect(history[0].reportId).toBe(report1.reportId);
      expect(history[1].reportId).toBe(report2.reportId);
    });
  });

  describe('runReconciliation', () => {
    it('should perform complete reconciliation of a single payment', async () => {
      const mockPayments = {
        records: [
          {
            id: '1',
            type: 'payment',
            transaction_hash: 'hash1',
            from: testAccountAddress,
            to: 'GBBBB',
            amount: '100.0000000',
            asset_type: 'native',
            created_at: '2024-01-15T10:00:00Z',
          },
        ],
      };

      const mockPaymentsApi = {
        forAccount: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        call: jest.fn().mockResolvedValue(mockPayments),
      };

      (mockHorizonServer.payments as jest.Mock).mockReturnValue(mockPaymentsApi);

      const expectedPayments: PaymentRecord[] = [
        {
          id: 'exp1',
          fromAddress: testAccountAddress,
          toAddress: 'GBBBB',
          amount: '100.0000000',
          asset: 'XLM',
          timestamp: '2024-01-15T10:00:00Z',
          status: 'success',
        },
      ];

      const report = await runReconciliation(expectedPayments, testAccountAddress);

      expect(report).toMatchObject({
        totalExpected: 1,
        totalMatched: 1,
        totalDiscrepancies: 0,
        matchPercentage: 100,
      });

      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          accountAddress: testAccountAddress,
          expectedPayments: 1,
        }),
        'Starting reconciliation'
      );

      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          accountAddress: testAccountAddress,
          matchPercentage: '100.00',
        }),
        'Reconciliation complete'
      );
    });

    it('should reconcile batch with partial failures', async () => {
      const mockPayments = {
        records: [
          {
            id: '1',
            type: 'payment',
            transaction_hash: 'hash1',
            from: testAccountAddress,
            to: 'GBBBB',
            amount: '100.0000000',
            asset_type: 'native',
            created_at: '2024-01-15T10:00:00Z',
          },
          {
            id: '2',
            type: 'payment',
            transaction_hash: 'hash2',
            from: testAccountAddress,
            to: 'GCCCC',
            amount: '50.0000000',
            asset_type: 'native',
            created_at: '2024-01-15T11:00:00Z',
          },
        ],
      };

      const mockPaymentsApi = {
        forAccount: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        call: jest.fn().mockResolvedValue(mockPayments),
      };

      (mockHorizonServer.payments as jest.Mock).mockReturnValue(mockPaymentsApi);

      const expectedPayments: PaymentRecord[] = [
        {
          id: 'exp1',
          fromAddress: testAccountAddress,
          toAddress: 'GBBBB',
          amount: '100.0000000',
          asset: 'XLM',
          timestamp: '2024-01-15T10:00:00Z',
          status: 'success',
        },
        {
          id: 'exp2',
          fromAddress: testAccountAddress,
          toAddress: 'GZZZZ', // Does not exist in ledger
          amount: '75.0000000',
          asset: 'XLM',
          timestamp: '2024-01-15T12:00:00Z',
          status: 'success',
        },
      ];

      const report = await runReconciliation(expectedPayments, testAccountAddress);

      expect(report.totalExpected).toBe(2);
      expect(report.totalMatched).toBe(1);
      expect(report.totalDiscrepancies).toBeGreaterThan(0);
      expect(report.matchPercentage).toBe(50);
    });

    it('should handle Horizon API failures', async () => {
      const mockPaymentsApi = {
        forAccount: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        call: jest.fn().mockRejectedValue(new Error('Network error')),
      };

      (mockHorizonServer.payments as jest.Mock).mockReturnValue(mockPaymentsApi);

      const expectedPayments: PaymentRecord[] = [];

      await expect(runReconciliation(expectedPayments, testAccountAddress)).rejects.toThrow(
        'Network error'
      );

      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          accountAddress: testAccountAddress,
          error: 'Network error',
        }),
        'Reconciliation failed'
      );
    });
  });

  describe('recordResolution', () => {
    it('should record a resolution for a discrepancy', () => {
      const resolution = recordResolution({
        discrepancyId: 'disc-123',
        action: 'mark_resolved',
        notes: 'Payment confirmed via manual review',
      });

      expect(resolution).toMatchObject({
        discrepancyId: 'disc-123',
        action: 'mark_resolved',
        notes: 'Payment confirmed via manual review',
      });
      expect(resolution.resolvedAt).toBeDefined();

      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          discrepancyId: 'disc-123',
          action: 'mark_resolved',
        }),
        'Resolution recorded'
      );
    });
  });

  describe('reconciliation history and statistics', () => {
    it('should retrieve reconciliation history with limit', () => {
      const matches: ReconciliationMatch[] = [];

      // Generate 5 reports
      for (let i = 0; i < 5; i++) {
        generateReconciliationReport(matches, []);
      }

      const history = getReconciliationHistory(3);

      expect(history).toHaveLength(3);
      // Should be the last 3 reports
      expect(history[0].reportId).toBeLessThan(history[1].reportId);
      expect(history[1].reportId).toBeLessThan(history[2].reportId);
    });

    it('should calculate reconciliation statistics', () => {
      const expectedPayment: PaymentRecord = {
        id: 'exp1',
        fromAddress: 'GAAAA',
        toAddress: 'GBBBB',
        amount: '100.0000000',
        asset: 'XLM',
        timestamp: '2024-01-15T10:00:00Z',
        status: 'success',
      };

      const ledgerTransaction: LedgerTransaction = {
        id: '1',
        hash: 'hash1',
        fromAddress: 'GAAAA',
        toAddress: 'GBBBB',
        amount: '100.0000000',
        asset: 'XLM',
        timestamp: '2024-01-15T10:00:00Z',
        type: 'payment',
      };

      const matches: ReconciliationMatch[] = [
        {
          expectedPayment,
          ledgerTransaction,
          matched: true,
          discrepancies: [],
        },
      ];

      generateReconciliationReport(matches, [ledgerTransaction]);
      recordResolution({
        discrepancyId: 'disc-123',
        action: 'investigate',
        notes: 'Needs investigation',
      });

      const stats = getReconciliationStatistics();

      expect(stats).toMatchObject({
        totalReports: 1,
        totalDiscrepancies: 0,
        totalResolutions: 1,
        averageMatchPercentage: 100,
      });
    });

    it('should clear reconciliation history', () => {
      const matches: ReconciliationMatch[] = [];

      generateReconciliationReport(matches, []);
      recordResolution({
        discrepancyId: 'disc-123',
        action: 'mark_resolved',
        notes: 'Test',
      });

      clearReconciliationHistory();

      expect(getReconciliationHistory()).toHaveLength(0);
      expect(getReconciliationStatistics().totalResolutions).toBe(0);
    });
  });

  describe('idempotency and retry logic', () => {
    it('should handle re-reconciliation of same payments idempotently', async () => {
      const mockPayments = {
        records: [
          {
            id: '1',
            type: 'payment',
            transaction_hash: 'hash1',
            from: testAccountAddress,
            to: 'GBBBB',
            amount: '100.0000000',
            asset_type: 'native',
            created_at: '2024-01-15T10:00:00Z',
          },
        ],
      };

      const mockPaymentsApi = {
        forAccount: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        call: jest.fn().mockResolvedValue(mockPayments),
      };

      (mockHorizonServer.payments as jest.Mock).mockReturnValue(mockPaymentsApi);

      const expectedPayments: PaymentRecord[] = [
        {
          id: 'exp1',
          fromAddress: testAccountAddress,
          toAddress: 'GBBBB',
          amount: '100.0000000',
          asset: 'XLM',
          timestamp: '2024-01-15T10:00:00Z',
          status: 'success',
        },
      ];

      const report1 = await runReconciliation(expectedPayments, testAccountAddress);
      const report2 = await runReconciliation(expectedPayments, testAccountAddress);

      // Both reports should have same match results
      expect(report1.totalMatched).toBe(report2.totalMatched);
      expect(report1.totalDiscrepancies).toBe(report2.totalDiscrepancies);
      expect(report1.matchPercentage).toBe(report2.matchPercentage);

      // Both reports should be stored in history
      const history = getReconciliationHistory(10);
      expect(history.length).toBeGreaterThanOrEqual(2);
    });

    it('should handle retry with improved tolerance', async () => {
      const mockPayments = {
        records: [
          {
            id: '1',
            type: 'payment',
            transaction_hash: 'hash1',
            from: testAccountAddress,
            to: 'GBBBB',
            amount: '100.5000000',
            asset_type: 'native',
            created_at: '2024-01-15T10:00:00Z',
          },
        ],
      };

      const mockPaymentsApi = {
        forAccount: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        call: jest.fn().mockResolvedValue(mockPayments),
      };

      (mockHorizonServer.payments as jest.Mock).mockReturnValue(mockPaymentsApi);

      const expectedPayments: PaymentRecord[] = [
        {
          id: 'exp1',
          fromAddress: testAccountAddress,
          toAddress: 'GBBBB',
          amount: '100.0000000',
          asset: 'XLM',
          timestamp: '2024-01-15T10:00:00Z',
          status: 'success',
        },
      ];

      // First attempt with strict tolerance (0.1%)
      const report1 = await runReconciliation(expectedPayments, testAccountAddress, {
        tolerance: { amountVariance: 0.1, timeWindow: 1800000 },
      });

      expect(report1.totalMatched).toBe(0);

      // Retry with relaxed tolerance (1%)
      const report2 = await runReconciliation(expectedPayments, testAccountAddress, {
        tolerance: { amountVariance: 1, timeWindow: 3600000 },
      });

      expect(report2.totalMatched).toBe(1);
    });
  });
});
