import { z } from 'zod';

export const registerWebhookSchema = z.object({
  url: z.string().url(),
  events: z.array(z.enum(['payment.confirmed', 'payment.failed'])).min(1),
});

export const inboundWebhookSchema = z.object({
  transactionHash: z.string(),
  amount: z.string(),
  destination: z.string(),
  memo: z.string().optional(),
  status: z.enum(['confirmed', 'failed']),
});
