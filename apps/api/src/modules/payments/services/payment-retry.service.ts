import logger from '@api/utils/logger';
import { PaymentRecordModel } from '../models/payment-record.model';
import { stellarClient } from './stellar-client';
import { confirmPayment } from './payment-confirmation.service';

const MAX_RETRY_AGE_HOURS = 24;
const CHECK_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes

let retryJobInterval: NodeJS.Timeout | null = null;

/**
 * Retry confirming payments that have a txHash recorded but failed during
 * Stellar verification (e.g. due to transient network errors).
 * These payments are in 'failed' status but have a txHash — indicating the
 * failure was likely transient, not a real payment mismatch.
 */
export async function retryFailedPaymentConfirmations(): Promise<void> {
  const cutoff = new Date(Date.now() - MAX_RETRY_AGE_HOURS * 60 * 60 * 1000);

  const candidates = await PaymentRecordModel.find({
    status: 'failed',
    txHash: { $exists: true, $ne: null },
    createdAt: { $gte: cutoff },
  }).lean();

  if (candidates.length === 0) return;

  logger.info({ count: candidates.length }, 'payment-retry: checking failed payments with txHash');

  for (const payment of candidates) {
    if (!payment.txHash) continue;

    try {
      const verification = await stellarClient.verifyTransaction(payment.txHash);

      if (!verification.found || !verification.transaction) {
        // Still not on-chain — leave as failed
        continue;
      }

      const tx = verification.transaction;

      // Verify basic fields match before re-confirming
      const amountMatch =
        parseFloat(tx.amount).toFixed(7) === parseFloat(payment.amount).toFixed(7);
      const destMatch =
        tx.to.toLowerCase() === payment.destination.toLowerCase();
      const assetMatch =
        tx.asset.split(':')[0].toUpperCase() === payment.assetCode.toUpperCase();

      if (!amountMatch || !destMatch || !assetMatch) {
        logger.warn(
          { intentId: payment.intentId, txHash: payment.txHash },
          'payment-retry: skipping — tx fields do not match payment record'
        );
        continue;
      }

      const result = await confirmPayment({
        intentId: payment.intentId,
        txHash: payment.txHash,
        allowAlreadyConfirmed: true,
      });

      logger.info(
        { intentId: payment.intentId, txHash: payment.txHash, result: result.status },
        'payment-retry: confirmation result'
      );
    } catch (err) {
      logger.warn(
        { intentId: payment.intentId, err },
        'payment-retry: error verifying transaction, will retry next run'
      );
    }
  }
}

export function startPaymentRetryJob(): void {
  if (retryJobInterval) return;

  retryJobInterval = setInterval(async () => {
    try {
      await retryFailedPaymentConfirmations();
    } catch (err) {
      logger.error({ err }, 'payment-retry: unhandled error');
    }
  }, CHECK_INTERVAL_MS);

  retryJobInterval.unref();
  logger.info('payment-retry: job started (interval: 10 min)');
}

export function stopPaymentRetryJob(): void {
  if (retryJobInterval) {
    clearInterval(retryJobInterval);
    retryJobInterval = null;
  }
}
