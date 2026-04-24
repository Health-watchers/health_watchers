import { PaymentRecordModel } from '../models/payment-record.model';
import { stellarClient } from './stellar-client';
import logger from '@api/utils/logger';

const STALE_PENDING_HOURS = 24;
const CHECK_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

let reconciliationJobInterval: NodeJS.Timeout | null = null;

/**
 * Check stale pending payments against Horizon and update their status.
 */
export async function reconcileStalePending(): Promise<number> {
  const threshold = new Date(Date.now() - STALE_PENDING_HOURS * 60 * 60 * 1000);

  const stale = await PaymentRecordModel.find({
    status: 'pending',
    createdAt: { $lt: threshold },
    txHash: { $exists: true, $ne: null },
  }).lean();

  let updated = 0;
  for (const record of stale) {
    try {
      const result = await stellarClient.verifyTransaction(record.txHash!);
      const newStatus = result.found && result.transaction?.success ? 'confirmed' : 'failed';
      await PaymentRecordModel.updateOne({ _id: record._id }, { status: newStatus });
      updated++;
    } catch (err) {
      logger.warn({ err, intentId: record.intentId }, 'Failed to verify stale payment');
    }
  }

  // Also mark stale pending records with no txHash as failed
  const noHashResult = await PaymentRecordModel.updateMany(
    { status: 'pending', createdAt: { $lt: threshold }, txHash: { $exists: false } },
    { status: 'failed' }
  );

  const total = updated + noHashResult.modifiedCount;
  if (total > 0) logger.info({ event: 'stale_pending_reconciled', count: total });
  return total;
}

export function startReconciliationJob(): void {
  if (reconciliationJobInterval) return;
  reconciliationJobInterval = setInterval(() => {
    reconcileStalePending().catch((err) => logger.error({ err }, 'Reconciliation job failed'));
  }, CHECK_INTERVAL_MS);
  // Run immediately
  reconcileStalePending().catch((err) => logger.error({ err }, 'Initial reconciliation failed'));
}

export function stopReconciliationJob(): void {
  if (reconciliationJobInterval) {
    clearInterval(reconciliationJobInterval);
    reconciliationJobInterval = null;
  }
}
