import { z } from 'zod';
import { NOTIFICATION_CHANNELS, TEMPLATE_LOCALES } from './notification-template.model';

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');
const channel = z.enum(NOTIFICATION_CHANNELS);
const locale = z.enum(TEMPLATE_LOCALES);

// ── Templates ───────────────────────────────────────────────────────────────
export const upsertTemplateBodySchema = z.object({
  key: z.string().min(1).max(100),
  channel,
  locale: locale.optional(),
  subject: z.string().max(300).optional(),
  body: z.string().min(1).max(10_000),
  description: z.string().max(500).optional(),
  isActive: z.boolean().optional(),
  /** When true the template applies platform-wide instead of to the caller's clinic. */
  global: z.boolean().optional(),
});

export const listTemplatesQuerySchema = z.object({
  key: z.string().max(100).optional(),
  channel: channel.optional(),
  includeGlobal: z.coerce.boolean().optional().default(true),
});

export const templateIdParamSchema = z.object({ id: objectId });

// ── Preferences ─────────────────────────────────────────────────────────────
const channelToggle = z.record(channel, z.boolean());

export const updatePreferencesBodySchema = z.object({
  enabled: z.boolean().optional(),
  channels: channelToggle.optional(),
  typeOverrides: z.record(z.string().min(1).max(100), channelToggle).optional(),
  quietHours: z
    .object({
      enabled: z.boolean().optional(),
      start: z
        .string()
        .regex(/^\d{2}:\d{2}$/)
        .optional(),
      end: z
        .string()
        .regex(/^\d{2}:\d{2}$/)
        .optional(),
      timezone: z.string().max(64).optional(),
    })
    .optional(),
  digest: z
    .object({
      enabled: z.boolean().optional(),
      frequency: z.enum(['daily', 'weekly']).optional(),
    })
    .optional(),
});

// ── Dispatch ────────────────────────────────────────────────────────────────
export const dispatchBodySchema = z.object({
  userId: objectId,
  type: z.string().min(1).max(100),
  channels: z.array(channel).min(1).optional(),
  templateKey: z.string().min(1).max(100).optional(),
  locale: locale.optional(),
  variables: z.record(z.string(), z.unknown()).optional(),
  title: z.string().max(300).optional(),
  message: z.string().max(10_000).optional(),
  link: z.string().max(2000).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  recipients: z.record(channel, z.string().max(320)).optional(),
  scheduledFor: z.coerce.date().optional(),
  maxAttempts: z.coerce.number().int().min(1).max(10).optional(),
});

export const deliveryQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(['pending', 'sent', 'delivered', 'failed', 'bounced', 'skipped']).optional(),
  channel: channel.optional(),
});

export const notificationIdParamSchema = z.object({ id: objectId });

export type DispatchBody = z.infer<typeof dispatchBodySchema>;
export type UpsertTemplateBody = z.infer<typeof upsertTemplateBodySchema>;
export type UpdatePreferencesBody = z.infer<typeof updatePreferencesBodySchema>;
