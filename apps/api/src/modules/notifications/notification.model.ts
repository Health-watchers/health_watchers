import { Schema, model, models, Types } from 'mongoose';

export const NOTIFICATION_TYPES = [
  'referral_received',
  'payment_confirmed',
  'appointment_reminder',
  'ai_summary_ready',
  'lab_result_ready',
  'system',
] as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export interface INotification {
  userId: Types.ObjectId;
  clinicId: Types.ObjectId;
  type: NotificationType;
  title: string;
  message: string;
  link?: string;
  isRead: boolean;
  readAt?: Date;
  metadata?: Record<string, unknown>;
  expiresAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const notificationSchema = new Schema<INotification>(
  {
    userId:    { type: Schema.Types.ObjectId, ref: 'User',   required: true, index: true },
    clinicId:  { type: Schema.Types.ObjectId, ref: 'Clinic', required: true, index: true },
    type:      { type: String, enum: NOTIFICATION_TYPES, required: true },
    title:     { type: String, required: true, trim: true },
    message:   { type: String, required: true, trim: true },
    link:      { type: String },
    isRead:    { type: Boolean, default: false, index: true },
    readAt:    { type: Date },
    metadata:  { type: Schema.Types.Mixed },
    expiresAt: { type: Date, index: { expireAfterSeconds: 0 } },
  },
  { timestamps: true, versionKey: false },
);

// Compound index for efficient per-user queries
notificationSchema.index({ userId: 1, createdAt: -1 });
notificationSchema.index({ userId: 1, isRead: 1 });

export const NotificationModel =
  models.Notification || model<INotification>('Notification', notificationSchema);
