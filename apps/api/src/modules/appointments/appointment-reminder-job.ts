import { AppointmentModel } from './appointment.model';
import { UserModel } from '../auth/models/user.model';
import { PatientModel } from '../patients/models/patient.model';
import { createNotification } from '../notifications/notification.service';
import { sendMail } from '@api/utils/mailer';
import { emitToUser } from '@api/realtime/socket';
import logger from '@api/utils/logger';

let reminderJobInterval: NodeJS.Timeout | null = null;

export function startAppointmentReminderJob() {
  if (reminderJobInterval) return;

  logger.info('Starting appointment reminder job (runs every 15 minutes)');

  // Run immediately on start
  sendAppointmentReminders().catch((err) => logger.error('Reminder job error:', err));

  // Then run every 15 minutes
  reminderJobInterval = setInterval(
    () => {
      sendAppointmentReminders().catch((err) => logger.error('Reminder job error:', err));
    },
    15 * 60 * 1000
  );
}

export function stopAppointmentReminderJob() {
  if (reminderJobInterval) {
    clearInterval(reminderJobInterval);
    reminderJobInterval = null;
    logger.info('Stopped appointment reminder job');
  }
}

async function sendAppointmentReminders() {
  const now = new Date();
  const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const in1h = new Date(now.getTime() + 60 * 60 * 1000);
  const in1hMinus5m = new Date(now.getTime() + 55 * 60 * 1000);

  try {
    // Find appointments scheduled in next 24 hours that haven't had 24h reminder
    const appointments24h = await AppointmentModel.find({
      scheduledAt: { $gte: now, $lte: in24h },
      status: { $in: ['scheduled', 'confirmed'] },
      reminderSent24h: false,
    })
      .populate('patientId')
      .populate('doctorId');

    for (const apt of appointments24h) {
      await sendReminder(apt, '24h');
      await AppointmentModel.updateOne({ _id: apt._id }, { reminderSent24h: true });
    }

    // Find appointments scheduled in next 1 hour that haven't had 1h reminder
    const appointments1h = await AppointmentModel.find({
      scheduledAt: { $gte: in1hMinus5m, $lte: in1h },
      status: { $in: ['scheduled', 'confirmed'] },
      reminderSent1h: false,
    })
      .populate('patientId')
      .populate('doctorId');

    for (const apt of appointments1h) {
      await sendReminder(apt, '1h');
      await AppointmentModel.updateOne({ _id: apt._id }, { reminderSent1h: true });
    }
  } catch (err) {
    logger.error(`Error in appointment reminder job: ${err}`);
  }
}

async function sendReminder(appointment: any, timeframe: '24h' | '1h') {
  const doctor = appointment.doctorId;
  const patient = appointment.patientId;

  if (!doctor || !patient) return;

  const timeText = timeframe === '24h' ? '24 hours' : '1 hour';
  const appointmentTime = new Date(appointment.scheduledAt).toLocaleString();

  // Check user preferences
  const doctorPrefs = await UserModel.findById(doctor._id).lean<{
    preferences?: { notificationTypes?: Record<string, boolean> };
  }>();
  const patientPrefs = await UserModel.findById(patient._id).lean<{
    preferences?: { notificationTypes?: Record<string, boolean> };
  }>();

  const doctorNotificationsEnabled =
    doctorPrefs?.preferences?.notificationTypes?.appointment_reminder !== false;
  const patientNotificationsEnabled =
    patientPrefs?.preferences?.notificationTypes?.appointment_reminder !== false;

  // Send to doctor
  if (doctorNotificationsEnabled) {
    await createNotification({
      userId: doctor._id,
      clinicId: appointment.clinicId,
      type: 'appointment_reminder',
      title: `Appointment Reminder (${timeText})`,
      message: `You have an appointment with ${patient.firstName} ${patient.lastName} in ${timeText} at ${appointmentTime}`,
      metadata: { appointmentId: appointment._id },
    });

    try {
      emitToUser(String(doctor._id), 'appointment:reminder', {
        appointmentId: appointment._id,
        timeframe,
        patientName: `${patient.firstName} ${patient.lastName}`,
        scheduledAt: appointment.scheduledAt,
      });
    } catch {
      // Socket may not be initialized
    }

    if (doctor.email) {
      await sendMail({
        to: doctor.email,
        subject: `Appointment Reminder: ${patient.firstName} ${patient.lastName} in ${timeText}`,
        html: `<p>You have an appointment with <strong>${patient.firstName} ${patient.lastName}</strong> in <strong>${timeText}</strong>.</p><p>Scheduled at: <strong>${appointmentTime}</strong></p>`,
      });
    }
  }

  // Send to patient
  if (patientNotificationsEnabled) {
    await createNotification({
      userId: patient._id,
      clinicId: appointment.clinicId,
      type: 'appointment_reminder',
      title: `Appointment Reminder (${timeText})`,
      message: `Your appointment with Dr. ${doctor.firstName} ${doctor.lastName} is in ${timeText} at ${appointmentTime}`,
      metadata: { appointmentId: appointment._id },
    });

    try {
      emitToUser(String(patient._id), 'appointment:reminder', {
        appointmentId: appointment._id,
        timeframe,
        doctorName: `Dr. ${doctor.firstName} ${doctor.lastName}`,
        scheduledAt: appointment.scheduledAt,
      });
    } catch {
      // Socket may not be initialized
    }

    if (patient.email) {
      await sendMail({
        to: patient.email,
        subject: `Appointment Reminder: Dr. ${doctor.firstName} ${doctor.lastName} in ${timeText}`,
        html: `<p>Your appointment with <strong>Dr. ${doctor.firstName} ${doctor.lastName}</strong> is in <strong>${timeText}</strong>.</p><p>Scheduled at: <strong>${appointmentTime}</strong></p>`,
      });
    }
  }
}
