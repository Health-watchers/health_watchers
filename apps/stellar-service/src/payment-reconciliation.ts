import { getHorizonServer } from './stellar.js';
import logger from './logger.js';

/**
 * Payment reconciliation service for Stellar
 * Matches transactions with expected payments and reports discrepancies
 */

export interface PaymentRecord {
  id: string;
  fromAddress: string;
  toAddress: string;
  amount: string;
  asset: string;
  timestamp: string;
  status: 'success' | 'failed' | 'pending';
  hash?: string;
  memo?: string;
}

export interface LedgerTransaction {
  id: string;
  hash: string;
  fromAddress: string;
  toAddress: string;
  amount: string;
  asset: string;
  timestamp: string;
  memo?: string;
  type: string;
}

export interface ReconciliationMatch {
  expectedPayment: PaymentRecord;
  ledgerTransaction: LedgerTransaction;
  matched: boolean;
  discrepancies: string[];
}

export interface ReconciliationDiscrepancy {
  id: string;
  type: 'missing_payment' | 'missing_ledger' | 'amount_mismatch' | 'recipient_mismatch' | 'timestamp_mismatch';
  expectedPayment?: PaymentRecord;
  ledgerTransaction?: LedgerTransaction;
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  timestamp: string;
}

export interface ReconciliationReport {
  reportId: string;
  timestamp: string;
  totalExpected: number;
  totalMatched: number;
  totalDiscrepancies: number;
  matchPercentage: number;
  discrepancies: ReconciliationDiscrepancy[];
  unmatched: {
    expected: PaymentRecord[];
    ledger: LedgerTransaction[];
  };
}

export interface ReconciliationResolution {
  discrepancyId: string;
  action: 'mark_resolved' | 'investigate' | 'manual_review';
  notes: string;
  resolvedAt: string;
}

// Store for reconciliation history
let reconciliationHistory: ReconciliationReport[] = [];
let resolutions: ReconciliationResolution[] = [];

/**
 * Fetch transactions from Stellar ledger for a given account
 */
export async function fetchLedgerTransactions(accountAddress: string, limit: number = 200): Promise<LedgerTransaction[]> {
  const server = getHorizonServer();
  const start = Date.now();

  try {
    const response = await server.payments().forAccount(accountAddress).limit(limit).order('desc').call();

    const transactions: LedgerTransaction[] = response.records
      .filter((r: any) => r.type === 'payment' || r.type === 'create_account')
      .map((r: any) => ({
        id: r.id,
        hash: r.transaction_hash,
        fromAddress: r.from ?? r.funder ?? '',
        toAddress: r.to ?? r.account ?? '',
        amount: r.amount ?? r.starting_balance ?? '0',
        asset: r.asset_type === 'native' ? 'XLM' : `${r.asset_code}:${r.asset_issuer}`,
        timestamp: r.created_at,
        memo: r.memo,
        type: r.type,
      }));

    logger.debug(
      { accountAddress, fetchedTransactions: transactions.length, durationMs: Date.now() - start },
      'Fetched ledger transactions'
    );

    return transactions;
  } catch (error: any) {
    logger.error(
      { accountAddress, error: error.message, durationMs: Date.now() - start },
      'Failed to fetch ledger transactions'
    );
    throw error;
  }
}

/**
 * Match expected payments with ledger transactions
 */
export function matchPayments(
  expectedPayments: PaymentRecord[],
  ledgerTransactions: LedgerTransaction[],
  tolerance: { amountVariance: number; timeWindow: number } = { amountVariance: 0.01, timeWindow: 3600000 }
): ReconciliationMatch[] {
  const matches: ReconciliationMatch[] = [];
  const matchedLedgerIndices = new Set<number>();

  logger.debug(
    { expectedCount: expectedPayments.length, ledgerCount: ledgerTransactions.length },
    'Starting payment matching'
  );

  for (const expected of expectedPayments) {
    let bestMatch: { index: number; discrepancies: string[] } | null = null;
    let bestMatchScore = 0;

    for (let i = 0; i < ledgerTransactions.length; i++) {
      if (matchedLedgerIndices.has(i)) continue;

      const ledger = ledgerTransactions[i];
      const discrepancies: string[] = [];
      let score = 0;

      // Check recipient
      if (expected.toAddress === ledger.toAddress) {
        score += 3;
      } else {
        discrepancies.push(`Recipient mismatch: ${expected.toAddress} vs ${ledger.toAddress}`);
      }

      // Check sender (if specified in expected)
      if (expected.fromAddress && expected.fromAddress === ledger.fromAddress) {
        score += 2;
      } else if (expected.fromAddress) {
        discrepancies.push(`Sender mismatch: ${expected.fromAddress} vs ${ledger.fromAddress}`);
      }

      // Check amount with tolerance
      const expectedAmount = parseFloat(expected.amount);
      const ledgerAmount = parseFloat(ledger.amount);
      const difference = Math.abs(expectedAmount - ledgerAmount);
      const varianceTolerance = expectedAmount * (tolerance.amountVariance / 100);

      if (difference <= varianceTolerance) {
        score += 3;
      } else {
        discrepancies.push(
          `Amount mismatch: ${expectedAmount} vs ${ledgerAmount} (diff: ${difference})`
        );
      }

      // Check asset
      if (expected.asset === ledger.asset) {
        score += 2;
      } else {
        discrepancies.push(`Asset mismatch: ${expected.asset} vs ${ledger.asset}`);
      }

      // Check timestamp with time window
      const expectedTime = new Date(expected.timestamp).getTime();
      const ledgerTime = new Date(ledger.timestamp).getTime();
      const timeDifference = Math.abs(expectedTime - ledgerTime);

      if (timeDifference <= tolerance.timeWindow) {
        score += 1;
      } else {
        discrepancies.push(
          `Timestamp mismatch: ${timeDifference}ms difference (window: ${tolerance.timeWindow}ms)`
        );
      }

      if (score > bestMatchScore) {
        bestMatchScore = score;
        bestMatch = { index: i, discrepancies };
      }
    }

    if (bestMatch && bestMatchScore >= 6) { // At least 60% match score
      matchedLedgerIndices.add(bestMatch.index);
      matches.push({
        expectedPayment: expected,
        ledgerTransaction: ledgerTransactions[bestMatch.index],
        matched: bestMatch.discrepancies.length === 0,
        discrepancies: bestMatch.discrepancies,
      });
    } else {
      matches.push({
        expectedPayment: expected,
        ledgerTransaction: {} as LedgerTransaction,
        matched: false,
        discrepancies: ['No matching ledger transaction found'],
      });
    }
  }

  logger.debug(
    { totalMatches: matches.length, perfectMatches: matches.filter(m => m.matched).length },
    'Payment matching complete'
  );

  return matches;
}

/**
 * Generate reconciliation report
 */
export function generateReconciliationReport(
  matches: ReconciliationMatch[],
  ledgerTransactions: LedgerTransaction[]
): ReconciliationReport {
  const reportId = `report-${Date.now()}`;
  const timestamp = new Date().toISOString();

  const perfectMatches = matches.filter(m => m.matched);
  const discrepancies: ReconciliationDiscrepancy[] = [];
  const unmatchedExpected: PaymentRecord[] = [];
  const unmatchedLedger: LedgerTransaction[] = [];

  // Identify discrepancies
  for (const match of matches) {
    if (!match.matched) {
      if (!match.ledgerTransaction.id) {
        // Expected payment not found in ledger
        unmatchedExpected.push(match.expectedPayment);
        discrepancies.push({
          id: `discrepancy-${Date.now()}-${Math.random()}`,
          type: 'missing_payment',
          expectedPayment: match.expectedPayment,
          severity: 'high',
          description: `Expected payment not found in ledger: ${match.expectedPayment.toAddress} for ${match.expectedPayment.amount} ${match.expectedPayment.asset}`,
          timestamp,
        });
      } else if (match.discrepancies.length > 0) {
        // Partial match with discrepancies
        discrepancies.push({
          id: `discrepancy-${Date.now()}-${Math.random()}`,
          type: match.discrepancies[0].includes('Amount') ? 'amount_mismatch' :
                match.discrepancies[0].includes('Recipient') ? 'recipient_mismatch' :
                match.discrepancies[0].includes('Timestamp') ? 'timestamp_mismatch' :
                'missing_payment',
          expectedPayment: match.expectedPayment,
          ledgerTransaction: match.ledgerTransaction,
          severity: 'medium',
          description: match.discrepancies.join('; '),
          timestamp,
        });
      }
    }
  }

  // Find ledger transactions with no expected payment
  const matchedLedgerHashes = new Set(matches.filter(m => m.ledgerTransaction.id).map(m => m.ledgerTransaction.hash));
  for (const ledger of ledgerTransactions) {
    if (!matchedLedgerHashes.has(ledger.hash)) {
      unmatchedLedger.push(ledger);
      discrepancies.push({
        id: `discrepancy-${Date.now()}-${Math.random()}`,
        type: 'missing_ledger',
        ledgerTransaction: ledger,
        severity: 'medium',
        description: `Unexpected ledger transaction: ${ledger.fromAddress} -> ${ledger.toAddress} for ${ledger.amount} ${ledger.asset}`,
        timestamp,
      });
    }
  }

  const report: ReconciliationReport = {
    reportId,
    timestamp,
    totalExpected: matches.length,
    totalMatched: perfectMatches.length,
    totalDiscrepancies: discrepancies.length,
    matchPercentage: matches.length > 0 ? (perfectMatches.length / matches.length) * 100 : 0,
    discrepancies,
    unmatched: {
      expected: unmatchedExpected,
      ledger: unmatchedLedger,
    },
  };

  // Store report in history
  reconciliationHistory.push(report);
  if (reconciliationHistory.length > 100) {
    reconciliationHistory = reconciliationHistory.slice(-100);
  }

  logger.info(
    {
      reportId,
      totalExpected: report.totalExpected,
      totalMatched: report.totalMatched,
      discrepancies: report.totalDiscrepancies,
      matchPercentage: report.matchPercentage.toFixed(2),
    },
    'Reconciliation report generated'
  );

  return report;
}

/**
 * Run complete reconciliation process
 */
export async function runReconciliation(
  expectedPayments: PaymentRecord[],
  accountAddress: string,
  options: { tolerance?: { amountVariance: number; timeWindow: number } } = {}
): Promise<ReconciliationReport> {
  const start = Date.now();

  try {
    logger.info({ accountAddress, expectedPayments: expectedPayments.length }, 'Starting reconciliation');

    // Fetch ledger transactions
    const ledgerTransactions = await fetchLedgerTransactions(accountAddress);

    // Match payments
    const matches = matchPayments(expectedPayments, ledgerTransactions, options.tolerance);

    // Generate report
    const report = generateReconciliationReport(matches, ledgerTransactions);

    logger.info(
      {
        accountAddress,
        durationMs: Date.now() - start,
        reportId: report.reportId,
        matchPercentage: report.matchPercentage.toFixed(2),
      },
      'Reconciliation complete'
    );

    return report;
  } catch (error: any) {
    logger.error(
      { accountAddress, error: error.message, durationMs: Date.now() - start },
      'Reconciliation failed'
    );
    throw error;
  }
}

/**
 * Record a discrepancy resolution
 */
export function recordResolution(resolution: Omit<ReconciliationResolution, 'resolvedAt'>): ReconciliationResolution {
  const complete: ReconciliationResolution = {
    ...resolution,
    resolvedAt: new Date().toISOString(),
  };

  resolutions.push(complete);
  if (resolutions.length > 1000) {
    resolutions = resolutions.slice(-1000);
  }

  logger.info(
    { discrepancyId: resolution.discrepancyId, action: resolution.action },
    'Resolution recorded'
  );

  return complete;
}

/**
 * Get reconciliation history
 */
export function getReconciliationHistory(limit: number = 20): ReconciliationReport[] {
  return reconciliationHistory.slice(-limit);
}

/**
 * Get resolution history
 */
export function getResolutionHistory(limit: number = 100): ReconciliationResolution[] {
  return resolutions.slice(-limit);
}

/**
 * Get summary statistics
 */
export function getReconciliationStatistics(): {
  totalReports: number;
  totalDiscrepancies: number;
  totalResolutions: number;
  averageMatchPercentage: number;
} {
  const totalDiscrepancies = reconciliationHistory.reduce((sum, r) => sum + r.totalDiscrepancies, 0);
  const averageMatchPercentage =
    reconciliationHistory.length > 0
      ? reconciliationHistory.reduce((sum, r) => sum + r.matchPercentage, 0) / reconciliationHistory.length
      : 0;

  return {
    totalReports: reconciliationHistory.length,
    totalDiscrepancies,
    totalResolutions: resolutions.length,
    averageMatchPercentage,
  };
}

/**
 * Clear reconciliation history
 */
export function clearReconciliationHistory(): void {
  reconciliationHistory = [];
  resolutions = [];
  logger.info('Reconciliation history cleared');
}
