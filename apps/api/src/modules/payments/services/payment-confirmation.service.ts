import logger from '@api/utils/logger';
import { sendPaymentConfirmationEmail } from '@api/lib/email.service';
import { UserModel } from '@api/modules/auth/models/user.model';
import { PaymentRecordModel } from '../models/payment-record.model';
import {
  recordOutboxEvent,
  dispatchCommittedOutboxEvents,
} from '@api/modules/outbox/outbox.service';
import { paymentsConfirmedTotal } from '@api/services/metrics.service';
import { getCurrentXLMRate } from './xlm-rate.service';

export interface ConfirmPaymentOptions {
  intentId: string;
  txHash: string;
  /** Skip re-confirming already-confirmed payments (webhook path) */
  allowAlreadyConfirmed?: boolean;
}

export interface ConfirmPaymentResult {
  status: 'confirmed' | 'already_confirmed' | 'not_found';
  payment?: Awaited<ReturnType<typeof PaymentRecordModel.findOne>>;
}

/**
 * Confirm a payment record and dispatch all post-confirmation side-effects:
 * email, WebSocket, in-app notification, invoice update, outbound webhooks, metrics.
 *
 * The WebSocket event, admin notifications and outbound webhooks are written
 * to the transactional outbox in the same transaction as the status change
 * (#1432), so a crash after commit can no longer lose them.
 */
export async function confirmPayment(opts: ConfirmPaymentOptions): Promise<ConfirmPaymentResult> {
  const { intentId, txHash, allowAlreadyConfirmed = false } = opts;

  const payment = await PaymentRecordModel.findOne({ intentId });
  if (!payment) return { status: 'not_found' };

  if (payment.status === 'confirmed') {
    if (allowAlreadyConfirmed) return { status: 'already_confirmed', payment };
    return { status: 'already_confirmed', payment };
  }

  // Capture exchange rate
  let exchangeRate = payment.exchangeRate;
  if (!exchangeRate) {
    if (payment.assetCode === 'USDC') {
      exchangeRate = '1';
    } else {
      try {
        const rate = await getCurrentXLMRate();
        exchangeRate = rate.rateUSD.toString();
      } catch {
        exchangeRate = '0';
      }
    }
  }
  const usdEquivalent = (parseFloat(payment.amount) * parseFloat(exchangeRate)).toFixed(2);

  // The payment status transition and the linked invoice update are committed
  // in a single transaction: if either write fails, neither is persisted. The
  // status filter makes the transition idempotent under concurrent confirms —
  // only one caller can move the payment out of its unconfirmed state.
  const { InvoiceModel } = await import('../../invoices/invoice.model');
  const clinicId = String(payment.clinicId);
  const admins = await UserModel.find({
    clinicId,
    role: { $in: ['CLINIC_ADMIN', 'SUPER_ADMIN'] },
  })
    .select('_id')
    .lean();
  let outboxEventId: string | null = null;
  // Assigned inside the transaction callback; the cast stops TS narrowing it to null.
  let updated = null as ConfirmPaymentResult['payment'];
  const session = await PaymentRecordModel.startSession();
  try {
    await session.withTransaction(async () => {
      updated = await PaymentRecordModel.findOneAndUpdate(
        { _id: payment._id, status: { $ne: 'confirmed' } },
        { status: 'confirmed', txHash, confirmedAt: new Date(), exchangeRate, usdEquivalent },
        { new: true, session }
      );
      if (!updated) return;

      await InvoiceModel.findOneAndUpdate(
        { paymentIntentId: intentId, status: { $ne: 'paid' } },
        { status: 'paid', paidAt: new Date(), paidTxHash: txHash },
        { session }
      );

      outboxEventId = await recordOutboxEvent(
        {
          type: 'payment.confirmed',
          aggregateType: 'PaymentRecord',
          aggregateId: String(updated._id),
          clinicId,
          payload: {
            paymentId: String(updated._id),
            intentId,
            amount: updated.amount,
            assetCode: updated.assetCode,
            destination: updated.destination,
            txHash,
            usdEquivalent,
            confirmedAt: updated.confirmedAt,
          },
          targets: [
            { kind: 'webhook', event: 'payment.confirmed' },
            {
              kind: 'socket',
              room: 'clinic',
              id: clinicId,
              event: 'payment:confirmed',
              data: {
                paymentId: String(updated._id),
                txHash,
                amount: updated.amount,
                assetCode: updated.assetCode,
              },
            },
            {
              kind: 'notification',
              userIds: admins.map((a) => String(a._id)),
              notificationType: 'payment_confirmed',
              title: 'Payment Confirmed',
              message: `Payment of ${updated.amount} ${updated.assetCode} confirmed on Stellar.`,
              metadata: { intentId, txHash, amount: updated.amount },
            },
          ],
        },
        session
      );
    });
  } finally {
    await session.endSession();
  }

  if (!updated) {
    // Lost a race with a concurrent confirmation of the same intent
    const current = await PaymentRecordModel.findById(payment._id);
    if (current?.status === 'confirmed') return { status: 'already_confirmed', payment: current };
    return { status: 'not_found' };
  }

  logger.info({ intentId, txHash }, 'payment-confirmation-service: payment confirmed');
  paymentsConfirmedTotal.inc({ currency: updated.assetCode ?? 'XLM' });
  if (outboxEventId) dispatchCommittedOutboxEvents([outboxEventId]);

  // Send email to clinic admin
  try {
    const { ClinicModel } = await import('../../clinics/clinic.model');
    const clinic = await ClinicModel.findById(clinicId).lean();
    if (clinic?.email) {
      sendPaymentConfirmationEmail(clinic.email, updated.amount, updated.assetCode, txHash);
    }
  } catch {
    /* non-critical */
  }

  return { status: 'confirmed', payment: updated };
}
