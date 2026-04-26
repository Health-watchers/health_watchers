import { WaitlistModel } from '../appointments/waitlist.model';
import { notifyNextOnWaitlist } from '../appointments/waitlist.service';
import { AppointmentModel } from '../appointments/appointment.model';
import logger from '@api/utils/logger';

const CHECK_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes
let jobInterval: NodeJS.Timeout | null = null;

export async function expireWaitlistEntries(): Promise<number> {
  const now = new Date();

  // Find notified entries whose 48h window has passed
  const expired = await WaitlistModel.find({
    status:    'notified',
    expiresAt: { $lte: now },
  }).lean();

  if (expired.length === 0) return 0;

  const ids = expired.map((e) => e._id);
  await WaitlistModel.updateMany({ _id: { $in: ids } }, { status: 'expired' });

  // For each expired entry, try to notify the next patient in the same clinic
  for (const entry of expired) {
    // Find a representative upcoming appointment for context (best-effort)
    const appt = await AppointmentModel.findOne({
      clinicId: entry.clinicId,
      doctorId:  entry.doctorId,
      status:    { $in: ['scheduled', 'confirmed'] },
      scheduledAt: { $gte: now },
    })
      .sort({ scheduledAt: 1 })
      .lean();

    if (appt) {
      await notifyNextOnWaitlist({
        clinicId:    String(entry.clinicId),
        doctorId:    String(entry.doctorId ?? appt.doctorId),
        scheduledAt: appt.scheduledAt,
      }).catch(() => {});
    }
  }

  logger.info({ count: expired.length }, 'Waitlist: expired notified entries');
  return expired.length;
}

export function startWaitlistExpiryJob(): void {
  if (jobInterval) return;
  expireWaitlistEntries().catch((err) => logger.error({ err }, 'Waitlist expiry initial run failed'));
  jobInterval = setInterval(() => {
    expireWaitlistEntries().catch((err) => logger.error({ err }, 'Waitlist expiry job failed'));
  }, CHECK_INTERVAL_MS);
  logger.info('Waitlist expiry job started');
}

export function stopWaitlistExpiryJob(): void {
  if (jobInterval) {
    clearInterval(jobInterval);
    jobInterval = null;
    logger.info('Waitlist expiry job stopped');
  }
}
