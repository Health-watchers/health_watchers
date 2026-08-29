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

export const registerWebhookSchema = z.object({
  url: webhookUrlField,
  events: z.array(z.enum(WEBHOOK_EVENTS)).min(1),
  description: z.string().max(255).optional(),
  retryConfig: retryConfigSchema.optional(),
});

export const updateWebhookSchema = z
  .object({
    url: webhookUrlField.optional(),
    events: z.array(z.enum(WEBHOOK_EVENTS)).min(1).optional(),
    isActive: z.boolean().optional(),
    description: z.string().max(255).optional(),
    retryConfig: retryConfigSchema.optional(),
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
