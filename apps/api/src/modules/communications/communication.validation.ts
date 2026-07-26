import { z } from 'zod';

export const logCommunicationSchema = z.object({
  channel: z.enum(['sms', 'whatsapp', 'email', 'phone_call', 'in_person']),
  direction: z.enum(['outbound', 'inbound']),
  content: z.string().min(1, 'Content is required'),
  status: z.enum(['sent', 'delivered', 'failed', 'read']),
  sentAt: z.coerce.date(),
  relatedEncounterId: z.string().optional(),
  twilioMessageSid: z.string().optional(),
});

export const listCommunicationsSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  channel: z.enum(['sms', 'whatsapp', 'email', 'phone_call', 'in_person']).optional(),
  direction: z.enum(['outbound', 'inbound']).optional(),
});

export type LogCommunicationInput = z.infer<typeof logCommunicationSchema>;
export type ListCommunicationsQuery = z.infer<typeof listCommunicationsSchema>;
