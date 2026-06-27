import logger from '@api/utils/logger';
import { sendPaymentConfirmationEmail } from '@api/lib/email.service';
import { emitToClinic } from '@api/realtime/socket';
import { createNotification } from '@api/modules/notifications/notification.service';
import { UserModel } from '@api/modules/auth/models/user.model';
import { PaymentRecordModel } from '../models/payment-record.model';
import { WebhookModel } from '@api/modules/webhooks/webhook.model';
import { enqueueWebhookDelivery } from '@api/modules/webhooks/webhook.service';
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

  const updated = await PaymentRecordModel.findByIdAndUpdate(
    payment._id,
    { status: 'confirmed', txHash, confirmedAt: new Date(), exchangeRate, usdEquivalent },
    { new: true }
  );

  if (!updated) return { status: 'not_found' };

  logger.info({ intentId, txHash }, 'payment-confirmation-service: payment confirmed');
  paymentsConfirmedTotal.inc({ currency: updated.assetCode ?? 'XLM' });

  // Update linked invoice
  try {
    const { InvoiceModel } = await import('../../invoices/invoice.model');
    await InvoiceModel.findOneAndUpdate(
      { paymentIntentId: intentId, status: { $ne: 'paid' } },
      { status: 'paid', paidAt: new Date(), paidTxHash: txHash }
    );
  } catch {
    /* non-critical */
  }

  const clinicId = String(updated.clinicId);

  // Emit WebSocket event to clinic
  emitToClinic(clinicId, 'payment:confirmed', {
    paymentId: String(updated._id),
    txHash,
    amount: updated.amount,
    assetCode: updated.assetCode,
  });

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

  // Create in-app notifications for clinic admins
  try {
    const admins = await UserModel.find({ clinicId, role: { $in: ['CLINIC_ADMIN', 'SUPER_ADMIN'] } })
      .select('_id')
      .lean();
    for (const admin of admins) {
      createNotification({
        userId: admin._id,
        clinicId,
        type: 'payment_confirmed',
        title: 'Payment Confirmed',
        message: `Payment of ${updated.amount} ${updated.assetCode} confirmed on Stellar.`,
        metadata: { intentId, txHash, amount: updated.amount },
      }).catch(() => {/* non-critical */});
    }
  } catch {
    /* non-critical */
  }

  // Dispatch outbound webhooks registered for this clinic
  try {
    const webhooks = await WebhookModel.find({
      clinicId,
      events: 'payment.confirmed',
      isActive: true,
    });
    for (const wh of webhooks) {
      enqueueWebhookDelivery(String(wh._id), 'payment.confirmed', wh.url, wh.secret, {
        event: 'payment.confirmed',
        data: {
          intentId,
          amount: updated.amount,
          assetCode: updated.assetCode,
          destination: updated.destination,
          txHash,
          usdEquivalent,
          confirmedAt: updated.confirmedAt,
        },
      }).catch(() => {/* non-critical */});
    }
  } catch {
    /* non-critical */
  }

  return { status: 'confirmed', payment: updated };
}
