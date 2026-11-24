import { Schema, model, models, Types } from 'mongoose';
import { NOTIFICATION_CHANNELS, NotificationChannel } from './notification-template.model';

/**
 * Per-channel delivery record for a dispatched notification (#1250).
 *
 * One notification fans out into one `NotificationDelivery` document per target
 * channel so that delivery status, retries and provider message ids can be
 * tracked independently.
 */
export const DELIVERY_STATUSES = [
  'pending', // queued, not yet attempted
  'sent', // handed to the provider
  'delivered', // provider confirmed delivery
  'failed', // all retries exhausted
  'bounced', // provider rejected the recipient
  'skipped', // suppressed by user preference / quiet hours / unconfigured channel
] as const;
export type DeliveryStatus = (typeof DELIVERY_STATUSES)[number];

export interface INotificationDelivery {
  _id: Types.ObjectId;
  /** Set when an in-app Notification document was also created. */
  notificationId?: Types.ObjectId;
  userId: Types.ObjectId;
  clinicId: Types.ObjectId;
  /** Notification `type` (see notification.model.ts NOTIFICATION_TYPES). */
  type: string;
  channel: NotificationChannel;
  /** Resolved recipient address: email, E.164 phone, device token or user id. */
  recipient: string;
  status: DeliveryStatus;
  attempts: number;
  maxAttempts: number;
  lastError?: string;
  providerMessageId?: string;
  /** When set in the future the delivery is held until this time. */
  scheduledFor?: Date;
  nextRetryAt?: Date;
  sentAt?: Date;
  deliveredAt?: Date;
  failedAt?: Date;
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

const notificationDeliverySchema = new Schema<INotificationDelivery>(
  {
    notificationId: { type: Schema.Types.ObjectId, ref: 'Notification', index: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    clinicId: { type: Schema.Types.ObjectId, ref: 'Clinic', required: true, index: true },
    type: { type: String, required: true },
    channel: { type: String, enum: NOTIFICATION_CHANNELS, required: true },
    recipient: { type: String, required: true },
    status: { type: String, enum: DELIVERY_STATUSES, default: 'pending', index: true },
    attempts: { type: Number, default: 0, min: 0 },
    maxAttempts: { type: Number, default: 5, min: 1 },
    lastError: { type: String },
    providerMessageId: { type: String },
    scheduledFor: { type: Date },
    nextRetryAt: { type: Date },
    sentAt: { type: Date },
    deliveredAt: { type: Date },
    failedAt: { type: Date },
    metadata: { type: Schema.Types.Mixed },
  },
  { timestamps: true, versionKey: false, collection: 'notification_deliveries' }
);

// Worker queues — due retries and due scheduled sends.
notificationDeliverySchema.index({ status: 1, nextRetryAt: 1 });
notificationDeliverySchema.index({ status: 1, scheduledFor: 1 });
notificationDeliverySchema.index({ userId: 1, createdAt: -1 });

export const NotificationDeliveryModel = (models.NotificationDelivery ||
  model<INotificationDelivery>(
    'NotificationDelivery',
    notificationDeliverySchema
  )) as import('mongoose').Model<INotificationDelivery>;
