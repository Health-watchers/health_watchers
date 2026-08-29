import {
  getDuePayments,
  recordPaymentAttempt,
  notifyPatientOfPayment,
} from './recurring-payment.service';
import logger from '../../utils/logger';

export async function processRecurringPayments() {
  try {
    const duePayments = await getDuePayments();

    for (const payment of duePayments) {
      try {
        // Create payment intent
        const intentId = `recurring_${payment._id}_${Date.now()}`;

        // Notify patient
        const { UserModel: User } = await import('../auth/models/user.model');
        const patient = await User.findById(payment.patientId);

        if (patient?.email) {
          const approveUrl = `${process.env.NEXT_PUBLIC_API_URL}/payments/approve/${intentId}`;
          await notifyPatientOfPayment(patient.email, payment.amount, payment.currency, approveUrl);
        }

        // Record pending attempt
        await recordPaymentAttempt(String(payment._id), intentId, 'pending');

        logger.info(
          { recurringPaymentId: payment._id, amount: payment.amount },
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

// Schedule to run daily
export function scheduleRecurringPaymentProcessor() {
  const dailyMs = 24 * 60 * 60 * 1000;
  setInterval(processRecurringPayments, dailyMs);
}
