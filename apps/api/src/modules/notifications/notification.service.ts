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
