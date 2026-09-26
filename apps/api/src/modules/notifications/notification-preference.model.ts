import { Schema, model, models, Types } from 'mongoose';
import { NOTIFICATION_CHANNELS, NotificationChannel } from './notification-template.model';

/**
 * Rich per-user notification preferences (#1250).
 *
 * The legacy `user.preferences.{inAppNotifications,emailNotifications,notificationTypes}`
 * flags are still honoured by the dispatch service for backward compatibility;
 * this document, when present, takes precedence and adds per-channel control,
 * per-type channel routing and quiet hours.
 */
export interface IChannelToggle {
  in_app: boolean;
  email: boolean;
  sms: boolean;
  push: boolean;
}

export interface IQuietHours {
  enabled: boolean;
  /** 24h `HH:mm` local time. */
  start: string;
  end: string;
  /** IANA timezone, e.g. `Africa/Lagos`. Defaults to UTC. */
  timezone: string;
}

export interface INotificationPreference {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  clinicId: Types.ObjectId;
  /** Master switch — disables every non-critical notification. */
  enabled: boolean;
  /** Default channel routing applied when a type has no specific override. */
  channels: IChannelToggle;
  /** Per notification-type channel override; missing types fall back to `channels`. */
  typeOverrides: Map<string, Partial<IChannelToggle>>;
  quietHours: IQuietHours;
  /** Digest instead of immediate delivery for low-priority in-app items. */
  digest: { enabled: boolean; frequency: 'daily' | 'weekly' };
  createdAt: Date;
  updatedAt: Date;
}

const channelToggle = (): Record<NotificationChannel, unknown> =>
  NOTIFICATION_CHANNELS.reduce(
    (acc, ch) => ({ ...acc, [ch]: { type: Boolean, default: true } }),
    {} as Record<NotificationChannel, unknown>
  );

const notificationPreferenceSchema = new Schema<INotificationPreference>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
      index: true,
    },
    clinicId: { type: Schema.Types.ObjectId, ref: 'Clinic', required: true, index: true },
    enabled: { type: Boolean, default: true },
    channels: channelToggle(),
    typeOverrides: {
      type: Map,
      of: new Schema({}, { strict: false, _id: false }),
      default: undefined,
    },
    quietHours: {
      enabled: { type: Boolean, default: false },
      start: { type: String, default: '22:00' },
      end: { type: String, default: '07:00' },
      timezone: { type: String, default: 'UTC' },
    },
    digest: {
      enabled: { type: Boolean, default: false },
      frequency: { type: String, enum: ['daily', 'weekly'], default: 'daily' },
    },
  },
  { timestamps: true, versionKey: false, collection: 'notification_preferences' }
);

export const NotificationPreferenceModel = (models.NotificationPreference ||
  model<INotificationPreference>(
    'NotificationPreference',
    notificationPreferenceSchema
  )) as import('mongoose').Model<INotificationPreference>;
