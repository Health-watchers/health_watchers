import { ClinicModel } from '../clinics/clinic.model';
import { ClinicSettingsModel } from '../clinics/clinic-settings.model';
import { BalanceSnapshotModel } from './models/balance-snapshot.model';
import { PaymentRecordModel } from './models/payment-record.model';
import { UserModel } from '../auth/models/user.model';
import { createNotification } from '../notifications/notification.service';
import {
  sendLowBalanceWarningEmail,
  sendCriticalBalanceEmail,
  sendLargeTransactionEmail,
  sendUnrecognizedTransactionEmail,
} from '@api/lib/email.service';
import { stellarClient } from './services/stellar-client';
import logger from '@api/utils/logger';

const CHECK_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes

let monitoringJobInterval: NodeJS.Timeout | null = null;

/** Midnight UTC date for daily snapshot deduplication */
function todayUtc(): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

/**
 * Check if a transaction hash is known (exists in PaymentRecordModel).
 */
async function isKnownTransaction(txHash: string, clinicId: string): Promise<boolean> {
  const record = await PaymentRecordModel.findOne({ txHash, clinicId }).lean();
  return record !== null;
}

/**
 * Get the CLINIC_ADMIN user for a clinic to send alerts to.
 */
async function getClinicAdmin(clinicId: string) {
  return UserModel.findOne({ clinicId, role: 'CLINIC_ADMIN', isActive: true }).lean();
}

/**
 * Run balance checks for a single clinic.
 */
async function checkClinic(clinicId: string, publicKey: string, clinicName: string): Promise<void> {
  const settings = await ClinicSettingsModel.findOne({ clinicId }).lean();
  const alerts = settings?.balanceAlerts ?? {
    lowBalanceWarningXlm: 100,
    criticalBalanceXlm: 10,
    largeTransactionXlm: 1000,
    alertsEnabled: true,
  };

  if (!alerts.alertsEnabled) return;

  let balanceData: { balance: string; usdcBalance: string | null; transactions: unknown[] };
  try {
    balanceData = await stellarClient.getBalance(publicKey);
  } catch (err) {
    logger.warn({ err, clinicId, publicKey }, 'Failed to fetch balance for monitoring');
    return;
  }

  const xlmBalance = parseFloat(balanceData.balance);
  const admin = await getClinicAdmin(clinicId);

  // ── Daily balance snapshot ────────────────────────────────────────────────
  await BalanceSnapshotModel.findOneAndUpdate(
    { clinicId, date: todayUtc() },
    { xlmBalance: balanceData.balance, usdcBalance: balanceData.usdcBalance },
    { upsert: true, new: true }
  );

  if (!admin) return;

  // ── Balance threshold alerts ──────────────────────────────────────────────
  if (xlmBalance < alerts.criticalBalanceXlm) {
    await createNotification({
      userId: admin._id,
      clinicId,
      type: 'balance_critical',
      title: 'Critical Balance Alert',
      message: `Your Stellar account balance (${balanceData.balance} XLM) is critically low. Payments may fail.`,
      link: '/wallet',
      metadata: { xlmBalance: balanceData.balance, threshold: alerts.criticalBalanceXlm },
    });
    sendCriticalBalanceEmail(
      admin.email,
      clinicName,
      balanceData.balance,
      alerts.criticalBalanceXlm
    );
  } else if (xlmBalance < alerts.lowBalanceWarningXlm) {
    await createNotification({
      userId: admin._id,
      clinicId,
      type: 'balance_low_warning',
      title: 'Low Balance Warning',
      message: `Your Stellar account balance (${balanceData.balance} XLM) is below the warning threshold.`,
      link: '/wallet',
      metadata: { xlmBalance: balanceData.balance, threshold: alerts.lowBalanceWarningXlm },
    });
    sendLowBalanceWarningEmail(
      admin.email,
      clinicName,
      balanceData.balance,
      alerts.lowBalanceWarningXlm
    );
  }

  // ── Transaction alerts ────────────────────────────────────────────────────
  const transactions = balanceData.transactions as Array<{
    hash: string;
    amount: string;
    from: string;
    to: string;
    asset: string;
  }>;

  for (const tx of transactions) {
    if (tx.asset !== 'XLM') continue;
    const amount = parseFloat(tx.amount);

    // Large transaction check
    if (amount >= alerts.largeTransactionXlm) {
      const direction = tx.to === publicKey ? 'incoming' : 'outgoing';
      await createNotification({
        userId: admin._id,
        clinicId,
        type: 'large_transaction',
        title: 'Large Transaction Detected',
        message: `A large ${direction} transaction of ${tx.amount} XLM was detected.`,
        link: '/wallet',
        metadata: { txHash: tx.hash, amount: tx.amount, direction, threshold: alerts.largeTransactionXlm },
      });
      sendLargeTransactionEmail(
        admin.email,
        clinicName,
        tx.amount,
        tx.hash,
        direction,
        alerts.largeTransactionXlm
      );
    }

    // Unrecognized transaction check (only for incoming)
    if (tx.to === publicKey) {
      const known = await isKnownTransaction(tx.hash, clinicId);
      if (!known) {
        await createNotification({
          userId: admin._id,
          clinicId,
          type: 'unrecognized_transaction',
          title: 'Unrecognized Transaction',
          message: `An unrecognized incoming transaction of ${tx.amount} XLM from ${tx.from} was detected.`,
          link: '/wallet',
          metadata: { txHash: tx.hash, amount: tx.amount, from: tx.from },
        });
        sendUnrecognizedTransactionEmail(
          admin.email,
          clinicName,
          tx.amount,
          tx.hash,
          tx.from
        );
      }
    }
  }
}

/**
 * Run balance monitoring for all active clinics with a Stellar public key.
 */
export async function runBalanceMonitoring(): Promise<void> {
  const clinics = await ClinicModel.find({
    isActive: true,
    stellarPublicKey: { $exists: true, $ne: null },
  }).lean();

  logger.info({ count: clinics.length }, 'Running balance monitoring check');

  await Promise.allSettled(
    clinics.map((clinic) =>
      checkClinic(String(clinic._id), clinic.stellarPublicKey!, clinic.name).catch((err) =>
        logger.error({ err, clinicId: clinic._id }, 'Balance check failed for clinic')
      )
    )
  );
}

export function startBalanceMonitoringJob(): void {
  if (monitoringJobInterval) {
    logger.warn('Balance monitoring job is already running');
    return;
  }

  logger.info(`Starting balance monitoring job (every ${CHECK_INTERVAL_MS / 60000}m)`);

  // Run immediately on startup
  runBalanceMonitoring().catch((err) =>
    logger.error({ err }, 'Initial balance monitoring check failed')
  );

  monitoringJobInterval = setInterval(() => {
    runBalanceMonitoring().catch((err) =>
      logger.error({ err }, 'Balance monitoring job failed')
    );
  }, CHECK_INTERVAL_MS);
}

export function stopBalanceMonitoringJob(): void {
  if (monitoringJobInterval) {
    clearInterval(monitoringJobInterval);
    monitoringJobInterval = null;
    logger.info('Balance monitoring job stopped');
  }
}

export function isBalanceMonitoringJobRunning(): boolean {
  return monitoringJobInterval !== null;
}
