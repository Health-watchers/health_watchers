import { Schema, model, models, Types } from 'mongoose';

/**
 * Notification delivery channels (#1250).
 *
 * `in_app` is always available; the remaining channels are only used when the
 * corresponding provider adapter reports itself as configured.
 */
export const NOTIFICATION_CHANNELS = ['in_app', 'email', 'sms', 'push'] as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

/** Locales supported by the templating system — mirrors lib/email.service. */
export const TEMPLATE_LOCALES = ['en', 'fr'] as const;
export type TemplateLocale = (typeof TEMPLATE_LOCALES)[number];

export interface INotificationTemplate {
  _id: Types.ObjectId;
  /** `null` for built-in / platform-wide templates; set for clinic overrides. */
  clinicId: Types.ObjectId | null;
  /** Stable identifier used by callers, e.g. `appointment_reminder`. */
  key: string;
  channel: NotificationChannel;
  locale: TemplateLocale;
  /** Email subject / push title. Ignored for SMS. Supports `{{var}}` placeholders. */
  subject?: string;
  /** Message body. Supports `{{var}}` placeholders. */
  body: string;
  description?: string;
  version: number;
  isActive: boolean;
  createdBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const notificationTemplateSchema = new Schema<INotificationTemplate>(
  {
    clinicId: {
      type: Schema.Types.ObjectId,
      ref: 'Clinic',
      default: null,
      index: true,
    },
    key: { type: String, required: true, trim: true, index: true },
    channel: { type: String, enum: NOTIFICATION_CHANNELS, required: true },
    locale: { type: String, enum: TEMPLATE_LOCALES, required: true, default: 'en' },
    subject: { type: String, trim: true },
    body: { type: String, required: true },
    description: { type: String, trim: true },
    version: { type: Number, default: 1, min: 1 },
    isActive: { type: Boolean, default: true, index: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true, versionKey: false, collection: 'notification_templates' }
);

// One active template per (scope, key, channel, locale). A clinic override and
// the global default coexist because `clinicId` differs.
notificationTemplateSchema.index({ clinicId: 1, key: 1, channel: 1, locale: 1 }, { unique: true });

export const NotificationTemplateModel = (models.NotificationTemplate ||
  model<INotificationTemplate>(
    'NotificationTemplate',
    notificationTemplateSchema
  )) as import('mongoose').Model<INotificationTemplate>;
