import { z } from 'zod';
import { validateWebhookUrl } from '@api/utils/url-validator';

export const WEBHOOK_EVENTS = [
  'payment.confirmed',
  'payment.failed',
  'appointment.created',
  'appointment.cancelled',
  'patient.created',
  'patient.updated',
] as const;

export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];

const webhookUrlField = z
  .string()
  .url()
  .refine(
    (url) => validateWebhookUrl(url).valid,
    (url) => ({ message: validateWebhookUrl(url).reason ?? 'URL is not allowed' })
  );

export const registerWebhookSchema = z.object({
  url: webhookUrlField,
  events: z.array(z.enum(WEBHOOK_EVENTS)).min(1),
});

export const updateWebhookSchema = z
  .object({
    url: webhookUrlField.optional(),
    events: z.array(z.enum(WEBHOOK_EVENTS)).min(1).optional(),
    isActive: z.boolean().optional(),
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
