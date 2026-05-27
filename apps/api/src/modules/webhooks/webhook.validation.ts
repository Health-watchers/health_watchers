import { z } from 'zod';
import { validateWebhookUrl } from '@api/utils/url-validator';

export const registerWebhookSchema = z.object({
  url: z.string().url().refine(
    (url) => validateWebhookUrl(url).valid,
    (url) => ({ message: validateWebhookUrl(url).reason ?? 'URL is not allowed' })
  ),
  events: z.array(z.enum(['payment.confirmed', 'payment.failed'])).min(1),
});

export const inboundWebhookSchema = z.object({
  transactionHash: z.string(),
  amount: z.string(),
  destination: z.string(),
  memo: z.string().optional(),
  status: z.enum(['confirmed', 'failed']),
});
