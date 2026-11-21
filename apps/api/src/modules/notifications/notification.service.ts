import { Types } from 'mongoose';
import { NotificationModel, NotificationType } from './notification.model';
import { UserModel } from '../auth/models/user.model';
import { emitToUser } from '@api/realtime/socket';

interface CreateNotificationInput {
  userId: string | Types.ObjectId;
  clinicId: string | Types.ObjectId;
  type: NotificationType;
  title: string;
  message: string;
  link?: string;
  metadata?: Record<string, unknown>;
  /** Defaults to 30 days from now */
  expiresAt?: Date;
}

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

const EXPO_PUSH_ENDPOINT = 'https://exp.host/--/api/v2/push/send';

interface AppointmentReminderInput {
  userId: string | Types.ObjectId;
  appointmentId: string | Types.ObjectId;
  /** Hours before the appointment (24 or 2) */
  hoursBefore: 24 | 2;
  title: string;
  message: string;
  /** ISO timestamp of the appointment start */
  startsAt: Date;
}

/**
 * Sends an appointment reminder via the Expo push API to the user's stored
 * device token. Respects the user's `appointment_reminder` preference.
 * Returns true when a push was dispatched, false otherwise.
 */
export async function sendAppointmentReminderPush(
  input: AppointmentReminderInput,
): Promise<boolean> {
  const user = await UserModel.findById(input.userId).lean<{
    expoPushToken?: string;
    preferences?: {
      pushNotifications?: boolean;
      notificationTypes?: Record<string, boolean>;
    };
  }>();

  if (!user?.expoPushToken) return false;

  // Respect global push preference and per-type appointment_reminder preference
  if (user.preferences?.pushNotifications === false) return false;
  if (user.preferences?.notificationTypes?.appointment_reminder === false) return false;

  const payload = {
    to: user.expoPushToken,
    sound: 'default',
    title: input.title,
    body: input.message,
    data: {
      type: 'appointment_reminder',
      appointmentId: String(input.appointmentId),
      hoursBefore: input.hoursBefore,
      startsAt: input.startsAt.toISOString(),
    },
  };

  try {
    const response = await fetch(EXPO_PUSH_ENDPOINT, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Accept-Encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) return false;

    const result = (await response.json()) as {
      data?: { status?: string; details?: { error?: string } };
    };

    // Expo returns per-message status; a DeviceNotRegistered error means the
    // token is stale and should be cleared so future sends are skipped.
    if (result?.data?.status === 'error') {
      if (result.data.details?.error === 'DeviceNotRegistered') {
        await UserModel.updateOne(
          { _id: input.userId },
          { $unset: { expoPushToken: 1 } },
        );
      }
      return false;
    }

    return result?.data?.status === 'ok';
  } catch {
    // Network/Expo outage — non-fatal, reminders are best-effort
    return false;
  }
}

export async function createNotification(input: CreateNotificationInput) {
  // Respect the user's global in-app notification preference
  const user = await UserModel.findById(input.userId).lean<{
    preferences?: {
      inAppNotifications?: boolean;
      notificationTypes?: Record<string, boolean>;
    };
  }>();

  if (user?.preferences?.inAppNotifications === false) return null;

  // Respect per-type preference (defaults to true if not set)
  const typeEnabled = user?.preferences?.notificationTypes?.[input.type];
  if (typeEnabled === false) return null;

  const notification = await NotificationModel.create({
    ...input,
    expiresAt: input.expiresAt ?? new Date(Date.now() + THIRTY_DAYS_MS),
  });

  // Emit real-time event to the user's socket room
  try {
    emitToUser(String(input.userId), 'notification:new', notification.toObject());
  } catch {
    // Socket may not be initialised in test environments — non-fatal
  }

  return notification;
}
