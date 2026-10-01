import { EncounterModel } from './encounter.model';
import { createNotification } from '../notifications/notification.service';
import { enqueueEmail } from '../../utils/email-queue';
import { UserModel } from '../auth/models/user.model';
import logger from '../../utils/logger';

export async function sendFollowUpReminders(): Promise<void> {
  const now = new Date();
  const tomorrowStart = new Date(now);
  tomorrowStart.setDate(tomorrowStart.getDate() + 1);
  tomorrowStart.setHours(0, 0, 0, 0);

  const tomorrowEnd = new Date(tomorrowStart);
  tomorrowEnd.setHours(23, 59, 59, 999);

  const encounters = await EncounterModel.find({
    followUpRequired: true,
    followUpCompleted: false,
    followUpDate: { $gte: tomorrowStart, $lt: tomorrowEnd },
  }).lean();

  for (const encounter of encounters) {
    try {
      // Notify attending doctor
      if (encounter.attendingDoctorId) {
        await createNotification({
          userId: encounter.attendingDoctorId.toString(),
          clinicId: encounter.clinicId.toString(),
          type: 'follow_up_reminder',
          title: 'Follow-up Due Tomorrow',
          message: `A follow-up is due tomorrow for encounter ${(encounter as any)._id}`,
          metadata: {
            encounterId: (encounter as any)._id.toString(),
            patientId: encounter.patientId.toString(),
            followUpDate: encounter.followUpDate,
          },
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
        { err, encounterId: (encounter as any)._id },
        'Failed to send follow-up reminder'
      );
    }
  }
}
