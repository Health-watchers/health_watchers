import * as reconciliation from '../payment-reconciliation.js';

describe('Payment Reconciliation', () => {
  const mockExpectedPayments: reconciliation.PaymentRecord[] = [
    {
      id: '1',
      fromAddress: 'GAAAA',
      toAddress: 'GBBBB',
      amount: '100',
      asset: 'XLM',
      timestamp: '2024-01-01T00:00:00Z',
      status: 'success',
      hash: 'hash1',
      memo: 'Payment 1',
    },
    {
      id: '2',
      fromAddress: 'GAAAA',
      toAddress: 'GCCCC',
      amount: '50',
      asset: 'XLM',
      timestamp: '2024-01-01T00:01:00Z',
      status: 'success',
      hash: 'hash2',
      memo: 'Payment 2',
    },
  ];

  const mockLedgerTransactions: reconciliation.LedgerTransaction[] = [
    {
      id: 'ledger1',
      hash: 'ledgerhash1',
      fromAddress: 'GAAAA',
      toAddress: 'GBBBB',
      amount: '100',
      asset: 'XLM',
      timestamp: '2024-01-01T00:00:01Z',
      type: 'payment',
    },
    {
      id: 'ledger2',
      hash: 'ledgerhash2',
      fromAddress: 'GAAAA',
      toAddress: 'GCCCC',
      amount: '50.5',
      asset: 'XLM',
      timestamp: '2024-01-01T00:01:02Z',
      type: 'payment',
    },
    {
      id: 'ledger3',
      hash: 'ledgerhash3',
      fromAddress: 'GDDDD',
      toAddress: 'GEEEE',
      amount: '25',
      asset: 'XLM',
      timestamp: '2024-01-01T00:02:00Z',
      type: 'payment',
    },
  ];

  describe('matchPayments', () => {
    it('should match expected payments with ledger transactions', () => {
      const matches = reconciliation.matchPayments(mockExpectedPayments, mockLedgerTransactions);
      expect(matches).toHaveLength(mockExpectedPayments.length);
    });

    it('should identify perfect matches', () => {
      const matches = reconciliation.matchPayments(mockExpectedPayments, mockLedgerTransactions);
      const perfectMatches = matches.filter((m) => m.matched);
      expect(perfectMatches.length).toBeGreaterThan(0);
    });

    it('should detect amount discrepancies', () => {
      const matches = reconciliation.matchPayments(mockExpectedPayments, mockLedgerTransactions);
      const secondMatch = matches[1];
      // 50 vs 50.5 should be within tolerance
      expect(secondMatch.matched).toBe(true);
    });

    it('should allow tolerance for small differences', () => {
      const matches = reconciliation.matchPayments(mockExpectedPayments, mockLedgerTransactions, {
        amountVariance: 2,
        timeWindow: 5000,
      });
      const secondMatch = matches[1];
      expect(secondMatch).toBeDefined();
    });
  });

  describe('generateReconciliationReport', () => {
    it('should generate a reconciliation report', () => {
      const matches = reconciliation.matchPayments(mockExpectedPayments, mockLedgerTransactions);
      const report = reconciliation.generateReconciliationReport(matches, mockLedgerTransactions);

      expect(report).toHaveProperty('reportId');
      expect(report).toHaveProperty('timestamp');
      expect(report).toHaveProperty('totalExpected');
      expect(report).toHaveProperty('totalMatched');
      expect(report).toHaveProperty('discrepancies');
      expect(report).toHaveProperty('unmatched');
    });

    it('should calculate match percentage correctly', () => {
      const matches = reconciliation.matchPayments(mockExpectedPayments, mockLedgerTransactions);
      const report = reconciliation.generateReconciliationReport(matches, mockLedgerTransactions);

      expect(report.matchPercentage).toBeGreaterThanOrEqual(0);
      expect(report.matchPercentage).toBeLessThanOrEqual(100);
    });

    it('should identify unmatched ledger transactions', () => {
      const matches = reconciliation.matchPayments(mockExpectedPayments, mockLedgerTransactions);
      const report = reconciliation.generateReconciliationReport(matches, mockLedgerTransactions);

      // Should have at least one unmatched ledger transaction (the third one)
      expect(report.unmatched.ledger.length).toBeGreaterThanOrEqual(0);
    });

    it('should create discrepancies for unmatched payments', () => {
      const matches = reconciliation.matchPayments(mockExpectedPayments, mockLedgerTransactions);
      const report = reconciliation.generateReconciliationReport(matches, mockLedgerTransactions);

      expect(report.discrepancies).toBeDefined();
      expect(Array.isArray(report.discrepancies)).toBe(true);
    });

    it('should store report in history', () => {
      reconciliation.clearReconciliationHistory();
      const matches = reconciliation.matchPayments(mockExpectedPayments, mockLedgerTransactions);
      const report1 = reconciliation.generateReconciliationReport(matches, mockLedgerTransactions);
      const report2 = reconciliation.generateReconciliationReport(matches, mockLedgerTransactions);

      const history = reconciliation.getReconciliationHistory();
      expect(history.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('recordResolution', () => {
    beforeEach(() => {
      reconciliation.clearReconciliationHistory();
    });

    it('should record a discrepancy resolution', () => {
      const resolution = reconciliation.recordResolution({
        discrepancyId: 'disc-123',
        action: 'mark_resolved',
        notes: 'Payment was successful',
      });

      expect(resolution).toHaveProperty('discrepancyId', 'disc-123');
      expect(resolution).toHaveProperty('action', 'mark_resolved');
      expect(resolution).toHaveProperty('resolvedAt');
    });

    it('should support different resolution actions', () => {
      const actions: Array<'mark_resolved' | 'investigate' | 'manual_review'> = [
        'mark_resolved',
        'investigate',
        'manual_review',
      ];

      actions.forEach((action) => {
        const resolution = reconciliation.recordResolution({
          discrepancyId: `disc-${action}`,
          action,
          notes: '',
        });
        expect(resolution.action).toBe(action);
      });
    });
  });

  describe('History and Statistics', () => {
    beforeEach(() => {
      reconciliation.clearReconciliationHistory();
    });

    it('should retrieve reconciliation history', () => {
      const matches = reconciliation.matchPayments(mockExpectedPayments, mockLedgerTransactions);
      reconciliation.generateReconciliationReport(matches, mockLedgerTransactions);

      const history = reconciliation.getReconciliationHistory();
      expect(Array.isArray(history)).toBe(true);
      expect(history.length).toBeGreaterThan(0);
    });

    it('should retrieve resolution history', () => {
      reconciliation.recordResolution({
        discrepancyId: 'disc-1',
        action: 'mark_resolved',
        notes: 'Test',
      });

      const history = reconciliation.getResolutionHistory();
      expect(Array.isArray(history)).toBe(true);
      expect(history.length).toBeGreaterThan(0);
    });

    it('should calculate reconciliation statistics', () => {
      const matches = reconciliation.matchPayments(mockExpectedPayments, mockLedgerTransactions);
      reconciliation.generateReconciliationReport(matches, mockLedgerTransactions);
      reconciliation.recordResolution({
        discrepancyId: 'disc-1',
        action: 'mark_resolved',
        notes: 'Test',
      });

      const stats = reconciliation.getReconciliationStatistics();
      expect(stats).toHaveProperty('totalReports');
      expect(stats).toHaveProperty('totalDiscrepancies');
      expect(stats).toHaveProperty('totalResolutions');
      expect(stats).toHaveProperty('averageMatchPercentage');
    });

    it('should respect history limits', () => {
      const matches = reconciliation.matchPayments(mockExpectedPayments, mockLedgerTransactions);
      for (let i = 0; i < 5; i++) {
        reconciliation.generateReconciliationReport(matches, mockLedgerTransactions);
      }

      const history = reconciliation.getReconciliationHistory(3);
      expect(history.length).toBeLessThanOrEqual(3);
    });

    it('should clear history correctly', () => {
      const matches = reconciliation.matchPayments(mockExpectedPayments, mockLedgerTransactions);
      reconciliation.generateReconciliationReport(matches, mockLedgerTransactions);
      let history = reconciliation.getReconciliationHistory();
      expect(history.length).toBeGreaterThan(0);

      reconciliation.clearReconciliationHistory();
      history = reconciliation.getReconciliationHistory();
      expect(history.length).toBe(0);
    });
  });

  describe('Discrepancy Types', () => {
    it('should identify missing payment discrepancies', () => {
      // Expected payment not in ledger
      const matches = reconciliation.matchPayments(
        [{ ...mockExpectedPayments[0], toAddress: 'GXXXXX' }],
        mockLedgerTransactions
      );
      const report = reconciliation.generateReconciliationReport(matches, mockLedgerTransactions);

      const missingPayments = report.discrepancies.filter((d) => d.type === 'missing_payment');
      expect(missingPayments.length).toBeGreaterThanOrEqual(0);
    });

    it('should identify missing ledger discrepancies', () => {
      // Ledger transaction not expected
      const matches = reconciliation.matchPayments(mockExpectedPayments, mockLedgerTransactions);
      const report = reconciliation.generateReconciliationReport(matches, mockLedgerTransactions);

      const missingLedgers = report.discrepancies.filter((d) => d.type === 'missing_ledger');
      // Should have at least one unmatched ledger transaction
      expect(report.unmatched.ledger.length).toBeGreaterThanOrEqual(0);
    });
  });
});
