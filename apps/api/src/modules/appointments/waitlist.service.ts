import { Types } from 'mongoose';
import { WaitlistModel } from './waitlist.model';
import { createNotification } from '@api/modules/notifications/notification.service';
import { UserModel } from '@api/modules/auth/models/user.model';
import { enqueue } from '@api/lib/email.service';
import logger from '@api/utils/logger';

const NOTIFY_WINDOW_HOURS = 48;

/**
 * Called after an appointment is cancelled.
 * Finds the next eligible waitlist patient and notifies them.
 */
export async function notifyNextOnWaitlist(params: {
  clinicId: string;
  doctorId: string;
  scheduledAt: Date;
}): Promise<void> {
  const { clinicId, doctorId, scheduledAt } = params;

  // Find next waiting entry: urgent first, then FIFO
  const next = await WaitlistModel.findOneAndUpdate(
    {
      clinicId:  new Types.ObjectId(clinicId),
      status:    'waiting',
      $or: [
        { doctorId: new Types.ObjectId(doctorId) },
        { doctorId: { $exists: false } },
      ],
    },
    {
      status:     'notified',
      notifiedAt: new Date(),
      expiresAt:  new Date(Date.now() + NOTIFY_WINDOW_HOURS * 60 * 60 * 1000),
    },
    {
      // Sort: urgent (priorityOrder=1) before routine (priorityOrder=0), then FIFO
      sort:  { priorityOrder: -1, addedAt: 1 },
      new:   true,
    }
  );

  if (!next) return;

  // Look up the patient's user account for notification
  const user = await UserModel.findOne({ patientId: next.patientId, role: 'PATIENT' }).lean();
  if (!user) {
    logger.warn({ patientId: next.patientId }, 'Waitlist: no user found for patient');
    return;
  }

  const dateStr = scheduledAt.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });

  // In-app notification
  await createNotification({
    userId:   user._id as Types.ObjectId,
    clinicId: new Types.ObjectId(clinicId),
    type:     'waitlist_available',
    title:    'Appointment Slot Available',
    message:  `A slot opened on ${dateStr}. You have ${NOTIFY_WINDOW_HOURS} hours to book it.`,
    link:     '/portal/appointments',
    metadata: { waitlistId: String(next._id), scheduledAt: scheduledAt.toISOString() },
    expiresAt: next.expiresAt,
  });

  // Email notification (stub — no SMS service wired up)
  if (user.email) {
    const portalUrl = `${process.env.APP_BASE_URL || 'http://localhost:3000'}/portal/appointments`;
    await enqueue(
      user.email,
      'Appointment Slot Available — Health Watchers',
      `A slot opened on ${dateStr}. Book within ${NOTIFY_WINDOW_HOURS} hours: ${portalUrl}`,
      `<h3>Appointment Slot Available</h3>
       <p>A slot opened on <strong>${dateStr}</strong>.</p>
       <p>You have <strong>${NOTIFY_WINDOW_HOURS} hours</strong> to book it before it is offered to the next patient.</p>
       <p><a href="${portalUrl}">Book Now</a></p>`
    );
  }

  logger.info({ waitlistId: next._id, patientId: next.patientId }, 'Waitlist: patient notified');
}
