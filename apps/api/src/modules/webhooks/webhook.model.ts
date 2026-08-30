import { Schema, model, models } from 'mongoose';

export interface IWebhook {
  clinicId: Schema.Types.ObjectId;
  url: string;
  events: string[];
  secret: string;
  isActive: boolean;
  description?: string;
  retryConfig?: {
    maxRetries: number;
    backoffType: 'exponential' | 'linear' | 'fixed';
    initialDelayMs: number;
  };
  /** #1253 — optional JSON payload template with `{{path}}` placeholders. */
  payloadTemplate?: Record<string, any>;
  /** #1253 — cap deliveries/min to this endpoint (0 = no cap). */
  rateLimitPerMin: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface IWebhookDelivery {
  webhookId: Schema.Types.ObjectId;
  event: string;
  url: string;
  payload: Record<string, any>;
  status: 'pending' | 'delivered' | 'failed' | 'dead';
  attempts: number;
  lastAttemptAt?: Date;
  nextRetryAt?: Date;
  error?: string;
  responseStatus?: number;
  /** #1253 — delivery debugging metadata. */
  requestHeaders?: Record<string, string>;
  responseBody?: string;
  durationMs?: number;
  isTest?: boolean;
  createdAt: Date;
}

export interface IWebhookEventLog {
  clinicId: Schema.Types.ObjectId;
  webhookId: Schema.Types.ObjectId;
  event: string;
  payload: Record<string, any>;
  status: 'dispatched' | 'delivered' | 'failed' | 'dead';
  deliveryId?: Schema.Types.ObjectId;
  deliveredAt?: Date;
  error?: string;
  createdAt: Date;
}

const defaultRetryConfig = {
  maxRetries: 3,
  backoffType: 'exponential' as const,
  initialDelayMs: 1000,
};

const webhookSchema = new Schema<IWebhook>(
  {
    clinicId: { type: Schema.Types.ObjectId, ref: 'Clinic', required: true, index: true },
    url: { type: String, required: true },
    events: { type: [String], required: true },
    secret: { type: String, required: true },
    isActive: { type: Boolean, default: true, index: true },
    description: { type: String },
    retryConfig: {
      maxRetries: { type: Number, default: defaultRetryConfig.maxRetries, min: 1, max: 10 },
      backoffType: {
        type: String,
        enum: ['exponential', 'linear', 'fixed'],
        default: defaultRetryConfig.backoffType,
      },
      initialDelayMs: {
        type: Number,
        default: defaultRetryConfig.initialDelayMs,
        min: 100,
        max: 60000,
      },
    },
    payloadTemplate: { type: Schema.Types.Mixed },
    rateLimitPerMin: { type: Number, default: 0, min: 0, max: 100000 },
  },
  { timestamps: true, versionKey: false }
);

webhookSchema.index({ clinicId: 1, isActive: 1 });

const webhookDeliverySchema = new Schema<IWebhookDelivery>(
  {
    webhookId: { type: Schema.Types.ObjectId, ref: 'Webhook', required: true, index: true },
    event: { type: String, required: true, index: true },
    url: { type: String, required: true },
    payload: { type: Schema.Types.Mixed, required: true },
    status: {
      type: String,
      enum: ['pending', 'delivered', 'failed', 'dead'],
      default: 'pending',
      index: true,
    },
    attempts: { type: Number, default: 0 },
    lastAttemptAt: { type: Date },
    nextRetryAt: { type: Date },
    error: { type: String },
    responseStatus: { type: Number },
    requestHeaders: { type: Schema.Types.Mixed },
    responseBody: { type: String },
    durationMs: { type: Number },
    isTest: { type: Boolean, default: false },
  },
  { timestamps: true, versionKey: false }
);

webhookDeliverySchema.index({ status: 1, nextRetryAt: 1 });
webhookDeliverySchema.index({ webhookId: 1, status: 1 });
webhookDeliverySchema.index({ webhookId: 1, createdAt: -1 });

const webhookEventLogSchema = new Schema<IWebhookEventLog>(
  {
    clinicId: { type: Schema.Types.ObjectId, ref: 'Clinic', required: true, index: true },
    webhookId: { type: Schema.Types.ObjectId, ref: 'Webhook', required: true, index: true },
    event: { type: String, required: true, index: true },
    payload: { type: Schema.Types.Mixed, required: true },
    status: {
      type: String,
      enum: ['dispatched', 'delivered', 'failed', 'dead'],
      default: 'dispatched',
      index: true,
    },
    deliveryId: { type: Schema.Types.ObjectId, ref: 'WebhookDelivery' },
    deliveredAt: { type: Date },
    error: { type: String },
  },
  { timestamps: true, versionKey: false }
);

webhookEventLogSchema.index({ clinicId: 1, event: 1 });
webhookEventLogSchema.index({ clinicId: 1, createdAt: -1 });

export const WebhookModel = (models.Webhook ||
  model<IWebhook>('Webhook', webhookSchema)) as import('mongoose').Model<IWebhook>;
export const WebhookDeliveryModel = (models.WebhookDelivery ||
  model<IWebhookDelivery>(
    'WebhookDelivery',
    webhookDeliverySchema
  )) as import('mongoose').Model<IWebhookDelivery>;
export const WebhookEventLogModel = (models.WebhookEventLog ||
  model<IWebhookEventLog>(
    'WebhookEventLog',
    webhookEventLogSchema
  )) as import('mongoose').Model<IWebhookEventLog>;
