import { PaymentRecordModel } from '../models/payment-record.model';
import logger from '@api/utils/logger';

/**
 * Payment Expiration Job
 *
 * Automatically expires pending payments based on their expiresAt timestamp.
 * Default expiry is 24 hours after creation.
 * Multi-sig payments use 24-hour timeout, escrow payments use 30-day timeout.
 *
 * Runs every 5 minutes to check for expired payments.
 */

const CHECK_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

let expirationJobInterval: NodeJS.Timeout | null = null;

/**
 * Calculate expiry date based on payment type
 */
export function calculateExpiryDate(paymentType: 'immediate' | 'multisig' | 'escrow' = 'immediate'): Date {
  const now = new Date();
  switch (paymentType) {
    case 'multisig':
      return new Date(now.getTime() + 24 * 60 * 60 * 1000); // 24 hours
    case 'escrow':
      return new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // 30 days
    case 'immediate':
    default:
      return new Date(now.getTime() + 24 * 60 * 60 * 1000); // 24 hours default
  }
}

/**
 * Expire pending payments that have passed their expiresAt timestamp
 */
export async function expirePendingPayments(): Promise<number> {
  const now = new Date();

  const result = await PaymentRecordModel.updateMany(
    {
      status: 'pending',
      expiresAt: { $lt: now },
    },
    {
      status: 'failed',
    }
  );

  if (result.modifiedCount > 0) {
    logger.info({
      event: 'payments_expired',
      count: result.modifiedCount,
      timestamp: now.toISOString(),
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

  logger.info(`Starting payment expiration job (checking every ${CHECK_INTERVAL_MS / 1000}s)`);

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
