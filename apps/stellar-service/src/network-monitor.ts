import { getHorizonServer } from './stellar.js';
import logger from './logger.js';

/**
 * Network monitoring service for Stellar
 * Tracks ledger status, transaction backlog, and network health
 */

export interface LedgerStatus {
  ledgerSequence: number;
  closeTime: string;
  baseFee: number;
  maxTxSetSize: number;
  protocolVersion: number;
}

export interface TransactionBacklog {
  pendingTransactions: number;
  averageWaitTime: number;
  backlogRatio: number;
  congestionLevel: 'low' | 'moderate' | 'high' | 'critical';
}

export interface NetworkAlert {
  id: string;
  level: 'info' | 'warning' | 'critical';
  timestamp: string;
  message: string;
  metric: string;
  threshold?: number;
  currentValue?: number;
}

export interface NetworkStatus {
  isHealthy: boolean;
  ledger: LedgerStatus;
  backlog: TransactionBacklog;
  alerts: NetworkAlert[];
  lastUpdated: string;
}

// Alert thresholds
const ALERT_THRESHOLDS = {
  highFee: 5000, // stroops
  highBacklog: 200, // pending transactions
  lowMaxTxSetSize: 100, // transactions
  protocolVersionLag: 3, // versions behind
};

// State for tracking metrics over time
let lastLedgerSequence = 0;
let lastCheckTime = Date.now();
let alertHistory: NetworkAlert[] = [];

/**
 * Get current ledger status
 */
export async function getLedgerStatus(): Promise<LedgerStatus> {
  const server = getHorizonServer();
  const start = Date.now();

  try {
    const ledger = await server.ledgers().limit(1).order('desc').call();
    const latestLedger = ledger.records[0];

    const status: LedgerStatus = {
      ledgerSequence: latestLedger.sequence,
      closeTime: latestLedger.closed_at,
      baseFee: latestLedger.base_fee_in_stroops,
      maxTxSetSize: latestLedger.max_tx_set_size,
      protocolVersion: latestLedger.protocol_version,
    };

    logger.debug({ ...status, durationMs: Date.now() - start }, 'Fetched ledger status');
    return status;
  } catch (error: any) {
    logger.error(
      { error: error.message, durationMs: Date.now() - start },
      'Failed to get ledger status'
    );
    throw error;
  }
}

/**
 * Get transaction backlog information
 */
export async function getTransactionBacklog(): Promise<TransactionBacklog> {
  const server = getHorizonServer();
  const start = Date.now();

  try {
    // Fetch recent transactions to estimate backlog
    const transactions = await server.transactions().limit(200).order('desc').call();
    const pendingTransactions = transactions.records.length;

    // Calculate average transaction processing time
    const times: number[] = [];
    for (let i = 1; i < Math.min(transactions.records.length, 50); i++) {
      const curr = new Date(transactions.records[i].created_at).getTime();
      const prev = new Date(transactions.records[i - 1].created_at).getTime();
      if (prev > curr) {
        times.push(prev - curr);
      }
    }

    const averageWaitTime =
      times.length > 0 ? Math.round(times.reduce((a, b) => a + b, 0) / times.length) : 0;

    // Fetch ledger to get max transaction set size
    const ledger = await server.ledgers().limit(1).order('desc').call();
    const maxTxSetSize = ledger.records[0].max_tx_set_size;

    const backlogRatio = maxTxSetSize > 0 ? pendingTransactions / maxTxSetSize : 0;

    // Determine congestion level based on backlog ratio
    let congestionLevel: 'low' | 'moderate' | 'high' | 'critical';
    if (backlogRatio < 0.25) congestionLevel = 'low';
    else if (backlogRatio < 0.5) congestionLevel = 'moderate';
    else if (backlogRatio < 0.8) congestionLevel = 'high';
    else congestionLevel = 'critical';

    const backlog: TransactionBacklog = {
      pendingTransactions,
      averageWaitTime,
      backlogRatio,
      congestionLevel,
    };

    logger.debug({ ...backlog, durationMs: Date.now() - start }, 'Calculated transaction backlog');
    return backlog;
  } catch (error: any) {
    logger.error(
      { error: error.message, durationMs: Date.now() - start },
      'Failed to get transaction backlog'
    );
    throw error;
  }
}

/**
 * Check for network alerts
 */
export async function checkNetworkAlerts(): Promise<NetworkAlert[]> {
  const alerts: NetworkAlert[] = [];
  const now = new Date().toISOString();

  try {
    const ledger = await getLedgerStatus();
    const backlog = await getTransactionBacklog();

    // Check fee threshold
    if (ledger.baseFee > ALERT_THRESHOLDS.highFee) {
      alerts.push({
        id: `alert-fee-${Date.now()}`,
        level: ledger.baseFee > ALERT_THRESHOLDS.highFee * 2 ? 'critical' : 'warning',
        timestamp: now,
        message: `Base fee is high: ${ledger.baseFee} stroops`,
        metric: 'baseFee',
        threshold: ALERT_THRESHOLDS.highFee,
        currentValue: ledger.baseFee,
      });
    }

    // Check backlog threshold
    if (backlog.pendingTransactions > ALERT_THRESHOLDS.highBacklog) {
      alerts.push({
        id: `alert-backlog-${Date.now()}`,
        level:
          backlog.pendingTransactions > ALERT_THRESHOLDS.highBacklog * 1.5 ? 'critical' : 'warning',
        timestamp: now,
        message: `High transaction backlog: ${backlog.pendingTransactions} pending`,
        metric: 'pendingTransactions',
        threshold: ALERT_THRESHOLDS.highBacklog,
        currentValue: backlog.pendingTransactions,
      });
    }

    // Check congestion
    if (backlog.congestionLevel === 'critical') {
      alerts.push({
        id: `alert-congestion-${Date.now()}`,
        level: 'critical',
        timestamp: now,
        message: `Network experiencing critical congestion (${Math.round(backlog.backlogRatio * 100)}% full)`,
        metric: 'backlogRatio',
        currentValue: backlog.backlogRatio,
      });
    }

    // Check max tx set size
    if (ledger.maxTxSetSize < ALERT_THRESHOLDS.lowMaxTxSetSize) {
      alerts.push({
        id: `alert-txsetsize-${Date.now()}`,
        level: 'warning',
        timestamp: now,
        message: `Low max transaction set size: ${ledger.maxTxSetSize}`,
        metric: 'maxTxSetSize',
        threshold: ALERT_THRESHOLDS.lowMaxTxSetSize,
        currentValue: ledger.maxTxSetSize,
      });
    }

    // Log any new alerts
    if (alerts.length > 0) {
      logger.warn({ alertCount: alerts.length, alerts }, 'Network alerts detected');
      alertHistory = [...alertHistory, ...alerts].slice(-100); // Keep last 100 alerts
    }

    return alerts;
  } catch (error: any) {
    logger.error({ error: error.message }, 'Failed to check network alerts');
    return [
      {
        id: `alert-error-${Date.now()}`,
        level: 'critical',
        timestamp: now,
        message: `Failed to check network health: ${error.message}`,
        metric: 'systemError',
      },
    ];
  }
}

/**
 * Get comprehensive network status
 */
export async function getNetworkStatus(): Promise<NetworkStatus> {
  const start = Date.now();

  try {
    const [ledger, backlog, alerts] = await Promise.all([
      getLedgerStatus(),
      getTransactionBacklog(),
      checkNetworkAlerts(),
    ]);

    const isHealthy = alerts.filter((a) => a.level === 'critical').length === 0;

    const status: NetworkStatus = {
      isHealthy,
      ledger,
      backlog,
      alerts,
      lastUpdated: new Date().toISOString(),
    };

    logger.info(
      {
        isHealthy,
        ledgerSequence: ledger.ledgerSequence,
        baseFee: ledger.baseFee,
        pendingTransactions: backlog.pendingTransactions,
        congestionLevel: backlog.congestionLevel,
        alertCount: alerts.length,
        durationMs: Date.now() - start,
      },
      'Network status check complete'
    );

    return status;
  } catch (error: any) {
    logger.error(
      { error: error.message, durationMs: Date.now() - start },
      'Failed to get network status'
    );
    throw error;
  }
}

/**
 * Track ledger growth
 */
export async function trackLedgerGrowth(): Promise<{
  ledgersPerSecond: number;
  lastLedger: number;
}> {
  const currentLedger = await getLedgerStatus();
  const currentTime = Date.now();
  const timeDelta = (currentTime - lastCheckTime) / 1000; // in seconds
  const ledgerDelta = currentLedger.ledgerSequence - lastLedgerSequence;

  let ledgersPerSecond = 0;
  if (timeDelta > 0) {
    ledgersPerSecond = ledgerDelta / timeDelta;
  }

  lastLedgerSequence = currentLedger.ledgerSequence;
  lastCheckTime = currentTime;

  logger.debug({ ledgersPerSecond, ledgerDelta, timeDelta }, 'Tracked ledger growth');

  return { ledgersPerSecond, lastLedger: currentLedger.ledgerSequence };
}

/**
 * Get alert history
 */
export function getAlertHistory(limit: number = 50): NetworkAlert[] {
  return alertHistory.slice(-limit);
}

/**
 * Clear alert history
 */
export function clearAlertHistory(): void {
  alertHistory = [];
  logger.info('Alert history cleared');
}

/**
 * Start periodic network monitoring
 */
export function startNetworkMonitoring(
  intervalMs: number = 30000,
  callback?: (status: NetworkStatus) => void
): () => void {
  logger.info({ intervalMs }, 'Starting network monitoring');

  const interval = setInterval(async () => {
    try {
      const status = await getNetworkStatus();
      if (callback) {
        callback(status);
      }
    } catch (error: any) {
      logger.error({ error: error.message }, 'Network monitoring check failed');
    }
  }, intervalMs);

  return () => {
    clearInterval(interval);
    logger.info('Network monitoring stopped');
  };
}
