import { PaymentRecordModel } from '../models/payment-record.model';
import logger from '@api/utils/logger';

/**
 * Payment Expiration Job
 *
 * Automatically expires pending payments that are older than 30 minutes.
 * This prevents payments from remaining in 'pending' state indefinitely.
 *
 * Runs every 5 minutes to check for expired payments.
 */

const PAYMENT_EXPIRY_MINUTES = 30;
const CHECK_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

let expirationJobInterval: NodeJS.Timeout | null = null;

/**
 * Expire pending payments older than the configured threshold
 */
export async function expirePendingPayments(): Promise<number> {
  const expiryThreshold = new Date(Date.now() - PAYMENT_EXPIRY_MINUTES * 60 * 1000);

  const result = await PaymentRecordModel.updateMany(
    {
      status: 'pending',
      createdAt: { $lt: expiryThreshold },
    },
    {
      status: 'failed',
    }
  );

  if (result.modifiedCount > 0) {
    logger.info({
      event: 'payments_expired',
      count: result.modifiedCount,
      threshold: expiryThreshold.toISOString(),
    });
  }

  return result.modifiedCount;
}

/**
 * Start the background job that periodically expires old pending payments
 */
export function startPaymentExpirationJob(): void {
  if (expirationJobInterval) {
    logger.warn('Payment expiration job is already running');
    return;
  }

  logger.info(
    `Starting payment expiration job (checking every ${CHECK_INTERVAL_MS / 1000}s, expiring after ${PAYMENT_EXPIRY_MINUTES}m)`
  );

  // Run immediately on startup
  expirePendingPayments().catch((err) => {
    logger.error({ err }, 'Initial payment expiration check failed');
  });

  // Then run periodically
  expirationJobInterval = setInterval(() => {
    expirePendingPayments().catch((err) => {
      logger.error({ err }, 'Payment expiration job failed');
    });
  }, CHECK_INTERVAL_MS);
}

/**
 * Stop the background job
 */
export function stopPaymentExpirationJob(): void {
  if (expirationJobInterval) {
    clearInterval(expirationJobInterval);
    expirationJobInterval = null;
    logger.info('Payment expiration job stopped');
  }
}

/**
 * Get the current status of the expiration job
 */
export function isPaymentExpirationJobRunning(): boolean {
  return expirationJobInterval !== null;
}
