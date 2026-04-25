import { Schema, model, models } from 'mongoose';

export interface IWebhook {
  clinicId: Schema.Types.ObjectId;
  url: string;
  events: string[];
  secret: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface IWebhookDelivery {
  webhookId: Schema.Types.ObjectId;
  event: string;
  url: string;
  payload: Record<string, any>;
  status: 'pending' | 'delivered' | 'failed';
  attempts: number;
  lastAttemptAt?: Date;
  nextRetryAt?: Date;
  error?: string;
  createdAt: Date;
}

const webhookSchema = new Schema<IWebhook>(
  {
    clinicId: { type: Schema.Types.ObjectId, ref: 'Clinic', required: true, index: true },
    url: { type: String, required: true },
    events: { type: [String], required: true },
    secret: { type: String, required: true },
    isActive: { type: Boolean, default: true, index: true },
  },
  { timestamps: true, versionKey: false }
);

const webhookDeliverySchema = new Schema<IWebhookDelivery>(
  {
    webhookId: { type: Schema.Types.ObjectId, ref: 'Webhook', required: true, index: true },
    event: { type: String, required: true, index: true },
    url: { type: String, required: true },
    payload: { type: Schema.Types.Mixed, required: true },
    status: {
      type: String,
      enum: ['pending', 'delivered', 'failed'],
      default: 'pending',
      index: true,
    },
    attempts: { type: Number, default: 0 },
    lastAttemptAt: { type: Date },
    nextRetryAt: { type: Date },
    error: { type: String },
  },
  { timestamps: true, versionKey: false }
);

webhookDeliverySchema.index({ status: 1, nextRetryAt: 1 });

export const WebhookModel = models.Webhook || model<IWebhook>('Webhook', webhookSchema);
export const WebhookDeliveryModel =
  models.WebhookDelivery || model<IWebhookDelivery>('WebhookDelivery', webhookDeliverySchema);
