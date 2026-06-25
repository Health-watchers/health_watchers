import { RecurringPayment } from './recurring-payment.model';
import { CreateRecurringPaymentInput, UpdateRecurringPaymentInput } from './recurring-payment.validation';
import { sendEmail } from '@api/lib/email.service';

function getNextPaymentDate(startDate: Date, frequency: string): Date {
  const next = new Date(startDate);
  switch (frequency) {
    case 'weekly':
      next.setDate(next.getDate() + 7);
      break;
    case 'monthly':
      next.setMonth(next.getMonth() + 1);
      break;
    case 'quarterly':
      next.setMonth(next.getMonth() + 3);
      break;
    case 'annually':
      next.setFullYear(next.getFullYear() + 1);
      break;
  }
  return next;
}

export async function createRecurringPayment(
  clinicId: string,
  input: CreateRecurringPaymentInput
) {
  const startDate = new Date(input.startDate);
  const nextPaymentDate = getNextPaymentDate(startDate, input.frequency);

  return RecurringPayment.create({
    clinicId,
    patientId: input.patientId,
    amount: input.amount,
    currency: input.currency,
    frequency: input.frequency,
    startDate,
    endDate: input.endDate ? new Date(input.endDate) : undefined,
    nextPaymentDate,
    description: input.description,
  });
}

const OBJECT_ID_REGEX = /^[a-f\d]{24}$/i;

export async function getRecurringPayments(clinicId: string, patientId?: string) {
  const query: Record<string, unknown> = { clinicId };
  if (patientId) {
    if (!OBJECT_ID_REGEX.test(patientId)) {
      throw new Error('Invalid patientId');
    }
    query.patientId = patientId;
  }
  return RecurringPayment.find(query).sort({ nextPaymentDate: 1 });
}

export async function pauseRecurringPayment(id: string) {
  return RecurringPayment.findByIdAndUpdate(id, { status: 'paused' }, { new: true });
}

export async function resumeRecurringPayment(id: string) {
  return RecurringPayment.findByIdAndUpdate(id, { status: 'active' }, { new: true });
}

export async function cancelRecurringPayment(id: string) {
  return RecurringPayment.findByIdAndUpdate(id, { status: 'cancelled' }, { new: true });
}

export async function updateRecurringPayment(id: string, input: UpdateRecurringPaymentInput) {
  return RecurringPayment.findByIdAndUpdate(id, input, { new: true });
}

export async function getDuePayments() {
  const now = new Date();
  return RecurringPayment.find({
    status: 'active',
    nextPaymentDate: { $lte: now },
  });
}

export async function recordPaymentAttempt(
  recurringPaymentId: string,
  intentId: string,
  status: 'pending' | 'completed' | 'failed',
  transactionHash?: string,
  failureReason?: string
) {
  const payment = await RecurringPayment.findById(recurringPaymentId);
  if (!payment) throw new Error('Recurring payment not found');

  const historyEntry = {
    date: new Date(),
    intentId,
    status,
    transactionHash,
    failureReason,
    retryCount: 0,
  };

  payment.paymentHistory.push(historyEntry);

  if (status === 'completed') {
    payment.nextPaymentDate = getNextPaymentDate(payment.nextPaymentDate, payment.frequency);
    payment.failureCount = 0;

    if (payment.endDate && payment.nextPaymentDate > payment.endDate) {
      payment.status = 'completed';
    }
  } else if (status === 'failed') {
    payment.failureCount += 1;
    if (payment.failureCount >= payment.maxRetries) {
      payment.status = 'paused';
    }
  }

  return payment.save();
}

export async function notifyPatientOfPayment(
  patientEmail: string,
  amount: string,
  currency: string,
  approveUrl: string
) {
  await sendEmail({
    to: patientEmail,
    subject: 'Payment Request - Action Required',
    html: `
      <p>You have a recurring payment due:</p>
      <p><strong>${amount} ${currency}</strong></p>
      <p><a href="${approveUrl}">Approve Payment</a></p>
    `,
  });
}
