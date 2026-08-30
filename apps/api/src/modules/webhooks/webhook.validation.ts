import { z } from 'zod';
import { validateWebhookUrl } from '@api/utils/url-validator';

export const WEBHOOK_EVENTS = [
  'payment.confirmed',
  'payment.failed',
  'appointment.created',
  'appointment.cancelled',
  'patient.created',
  'patient.updated',
  'encounter.created',
  'encounter.updated',
  'lab_result.created',
  'lab_result.updated',
  'referral.created',
  'referral.completed',
  'immunization.recorded',
  'care_plan.created',
  'care_plan.updated',
  'consent.granted',
  'consent.revoked',
  'notification.created',
  'invoice.created',
  'invoice.paid',
  'webhook.test',
] as const;

export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];

const webhookUrlField = z
  .string()
  .url()
  .refine(
    (url) => validateWebhookUrl(url).valid,
    (url) => ({ message: validateWebhookUrl(url).reason ?? 'URL is not allowed' })
  );

const retryConfigSchema = z.object({
  maxRetries: z.number().int().min(1).max(10).optional(),
  backoffType: z.enum(['exponential', 'linear', 'fixed']).optional(),
  initialDelayMs: z.number().int().min(100).max(60000).optional(),
});

// #1253 — a webhook may only subscribe to real events; `webhook.test` is
// reserved for the "send test" endpoint and cannot be registered.
const subscribableEvents = WEBHOOK_EVENTS.filter((e) => e !== 'webhook.test') as [
  string,
  ...string[],
];

// #1253 — payload template: shallow JSON object, string leaves may contain
// `{{path}}` placeholders. Depth/size are bounded to keep it a reshaping tool.
const payloadTemplateSchema = z
  .record(z.any())
  .refine((obj) => JSON.stringify(obj).length <= 8000, {
    message: 'payloadTemplate must serialise to 8000 characters or fewer',
  });

export const registerWebhookSchema = z.object({
  url: webhookUrlField,
  events: z.array(z.enum(subscribableEvents)).min(1),
  description: z.string().max(255).optional(),
  retryConfig: retryConfigSchema.optional(),
  payloadTemplate: payloadTemplateSchema.optional(),
  rateLimitPerMin: z.number().int().min(0).max(100000).optional(),
});

export const updateWebhookSchema = z
  .object({
    url: webhookUrlField.optional(),
    events: z.array(z.enum(subscribableEvents)).min(1).optional(),
    isActive: z.boolean().optional(),
    description: z.string().max(255).optional(),
    retryConfig: retryConfigSchema.optional(),
    payloadTemplate: payloadTemplateSchema.nullable().optional(),
    rateLimitPerMin: z.number().int().min(0).max(100000).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided',
  });

export const inboundWebhookSchema = z.object({
  transactionHash: z.string(),
  amount: z.string(),
  destination: z.string(),
  memo: z.string().optional(),
  status: z.enum(['confirmed', 'failed']),
});
