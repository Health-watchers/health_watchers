import { PaymentRecordModel } from '../models/payment-record.model';
import { UserModel } from '../../auth/models/user.model';
import { createNotification } from '../../notifications/notification.service';
import { sendClaimableExpiryEmail } from '@api/lib/email.service';
import { emitToUser } from '@api/realtime/socket';
import logger from '@api/utils/logger';

export const CHECK_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

let jobInterval: NodeJS.Timeout | null = null;

/**
 * Find claimable balances expiring within the next 24 hours that haven't
 * had a notification sent yet, notify the patient, and mark the flag.
 */
export async function sendClaimableExpiryNotifications(): Promise<number> {
  const now = new Date();
  const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  const expiring = await PaymentRecordModel.find({
    claimableUntil: { $gte: now, $lte: in24h },
    claimed: { $ne: true },
    claimableExpiryNotificationSent: { $ne: true },
  }).lean();

  if (expiring.length === 0) return 0;

  let notified = 0;

  for (const record of expiring) {
    try {
      if (!record.patientId) continue;

      const patient = await UserModel.findById(record.patientId).lean<{
        _id: unknown;
        email?: string;
        fullName?: string;
      }>();

      if (!patient) continue;

      const patientName = patient.fullName?.trim() || 'Patient';

      // In-app notification
      await createNotification({
        userId: record.patientId,
        clinicId: record.clinicId,
        type: 'claimable_expiring',
        title: 'Claimable Payment Expiring Soon',
        message: `Your claimable payment of ${record.amount} XLM expires on ${record.claimableUntil!.toUTCString()}. Claim it before it expires.`,
        link: '/portal/payments',
        metadata: {
          claimableBalanceId: record.claimableBalanceId,
          amount: record.amount,
          claimableUntil: record.claimableUntil,
        },
      });

      // Socket.IO event
      try {
        emitToUser(String(record.patientId), 'payment:claimable_expiring', {
          claimableBalanceId: record.claimableBalanceId,
          amount: record.amount,
          claimableUntil: record.claimableUntil,
        });
      } catch {
        // Non-fatal — socket may not be initialised
      }

      // Email notification
      if (patient.email) {
        sendClaimableExpiryEmail(patient.email, patientName, record.amount, record.claimableUntil!);
      }

      // Mark notification sent
      await PaymentRecordModel.updateOne(
        { _id: record._id },
        { claimableExpiryNotificationSent: true }
      );

      notified++;
    } catch (err) {
      logger.error(
        { err, paymentId: record._id },
        '[claimable-expiry-job] failed to notify for payment'
      );
    }
  }

  if (notified > 0) {
    logger.info({ count: notified }, '[claimable-expiry-job] sent expiry notifications');
  }

  return notified;
}

export function startClaimableExpiryNotificationJob(): void {
  if (jobInterval) {
    logger.warn('[claimable-expiry-job] already running');
    return;
  }

  logger.info(`[claimable-expiry-job] starting (interval=${CHECK_INTERVAL_MS / 60000}m)`);

  sendClaimableExpiryNotifications().catch((err) =>
    logger.error({ err }, '[claimable-expiry-job] initial run failed')
  );

  jobInterval = setInterval(() => {
    sendClaimableExpiryNotifications().catch((err) =>
      logger.error({ err }, '[claimable-expiry-job] tick failed')
    );
  }, CHECK_INTERVAL_MS);
}

export function stopClaimableExpiryNotificationJob(): void {
  if (jobInterval) {
    clearInterval(jobInterval);
    jobInterval = null;
    logger.info('[claimable-expiry-job] stopped');
  }
}

export function isClaimableExpiryNotificationJobRunning(): boolean {
  return jobInterval !== null;
}
