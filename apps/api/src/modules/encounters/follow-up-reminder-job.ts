import { EncounterModel } from './encounter.model';
import { createNotification } from '../notifications/notification.service';
import { enqueueEmail } from '../../utils/email-queue';
import { UserModel } from '../auth/models/user.model';
import logger from '../../utils/logger';

/**
 * Compute the [start, end) range covering tomorrow in the server's local time.
 */
export function getTomorrowRange(now: Date = new Date()): {
  start: Date;
  end: Date;
} {
  const start = new Date(now);
  start.setDate(start.getDate() + 1);
  start.setHours(0, 0, 0, 0);

  const end = new Date(start);
  end.setDate(end.getDate() + 1);

  return { start, end };
}

/**
 * Send follow-up reminders for encounters whose follow-up is due tomorrow.
 *
 * - In-app notification to the attending doctor.
 * - Email reminder to the linked patient user when their preferences allow it.
 *
 * Errors are logged per-encounter and do not abort the remaining reminders.
 */
export async function sendFollowUpReminders(now: Date = new Date()): Promise<void> {
  const { start: tomorrowStart, end: tomorrowEnd } = getTomorrowRange(now);

  const encounters = await EncounterModel.find({
    followUpRequired: true,
    followUpCompleted: false,
    followUpDate: { $gte: tomorrowStart, $lt: tomorrowEnd },
  }).lean();

  for (const encounter of encounters) {
    const encounterId = (encounter as any)._id;
    try {
      const metadata = {
        encounterId: encounterId.toString(),
        patientId: encounter.patientId.toString(),
        followUpDate: encounter.followUpDate,
        contactNumber: (encounter as any).contactNumber ?? null,
      };

      // Notify attending doctor
      if (encounter.attendingDoctorId) {
        await createNotification({
          userId: encounter.attendingDoctorId.toString(),
          clinicId: encounter.clinicId.toString(),
          type: 'follow_up_reminder',
          title: 'Follow-up Due Tomorrow',
          message: `A follow-up is due tomorrow for encounter ${encounterId}`,
          metadata,
        });
      }

      // Find patient user and send email if enabled
      const patientUser = await UserModel.findOne({
        patientId: encounter.patientId,
        role: 'PATIENT',
      }).lean();

      if (patientUser) {
        const prefs = (patientUser as any).preferences;
        if (
          prefs?.emailNotifications !== false &&
          prefs?.notificationTypes?.follow_up_reminder !== false
        ) {
          await enqueueEmail({
            to: (patientUser as any).email,
            subject: 'Follow-up Appointment Reminder',
            text: 'Your follow-up appointment is scheduled for tomorrow.',
            html: `<p>Your follow-up appointment is scheduled for tomorrow.</p>`,
          });
        }
      }
    } catch (err) {
      logger.error(
        { err, encounterId },
        'Failed to send follow-up reminder'
      );
    }
  }
}

/**
 * Job handler suitable for registration in the JobRegistry.
 * Intended to run daily at 08:00 UTC.
 */
export async function followUpReminderJobHandler(): Promise<void> {
  logger.info('Running follow-up reminder job');
  await sendFollowUpReminders();
}

export const followUpReminderJob = {
  name: 'follow-up-reminder',
  schedule: '0 8 * * *', // daily at 08:00 UTC
  timezone: 'UTC',
  handler: followUpReminderJobHandler,
};

export default followUpReminderJob;
