import {
  getDuePayments,
  recordPaymentAttempt,
  notifyPatientOfPayment,
} from './recurring-payment.service';
import logger from '../../utils/logger';

/**
 * Builds a deterministic idempotency key for a recurring payment period.
 * A given subscription can only be charged once per billing period, regardless
 * of how many replicas run this handler or how often it is retried.
 */
export function buildRecurringPaymentIdempotencyKey(
  subscriptionId: string,
  billingPeriod: string
): string {
  return `recurring:${subscriptionId}:${billingPeriod}`;
}

/**
 * Processes all due recurring payments.
 *
 * This handler is idempotent: each (subscriptionId, billingPeriod) pair is
 * charged at most once. It is intended to be driven exclusively by the
 * distributed BullMQ job registry (see apps/api/src/jobs/), not by an
 * in-process timer, so that it runs exactly once per period across replicas.
 */
export async function processRecurringPayments() {
  try {
    const duePayments = await getDuePayments();

    for (const payment of duePayments) {
      try {
        const subscriptionId = String(payment.subscriptionId ?? payment._id);
        const billingPeriod = String(payment.billingPeriod ?? '');

        if (!billingPeriod) {
          logger.warn(
            { recurringPaymentId: payment._id, subscriptionId },
            'Skipping recurring payment without billing period'
          );
          continue;
        }

        // Deterministic intent id doubles as the idempotency key so that
        // concurrent replicas converge on the same attempt record.
        const intentId = buildRecurringPaymentIdempotencyKey(subscriptionId, billingPeriod);

        // Record pending attempt first; the underlying store enforces a unique
        // index on (subscriptionId, billingPeriod) so duplicate runs are no-ops.
        const recorded = await recordPaymentAttempt(
          String(payment._id),
          intentId,
          'pending',
          { subscriptionId, billingPeriod }
        );

        if (recorded === false) {
          logger.debug(
            { recurringPaymentId: payment._id, subscriptionId, billingPeriod },
            'Recurring payment already processed for this billing period; skipping'
          );
          continue;
        }

        // Notify patient
        const { UserModel: User } = await import('../auth/models/user.model');
        const patient = await User.findById(payment.patientId);

        if (patient?.email) {
          const approveUrl = `${process.env.NEXT_PUBLIC_API_URL}/payments/approve/${intentId}`;
          await notifyPatientOfPayment(patient.email, payment.amount, payment.currency, approveUrl);
        }

        logger.info(
          { recurringPaymentId: payment._id, subscriptionId, billingPeriod, amount: payment.amount },
          'Recurring payment notification sent'
        );
      } catch (error) {
        logger.error({ err: error, paymentId: payment._id }, 'Failed to process recurring payment');
      }
    }
  } catch (error) {
    logger.error({ err: error }, 'Recurring payment scheduler error');
  }
}