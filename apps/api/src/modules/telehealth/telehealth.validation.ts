import { z } from 'zod';
import { BANDWIDTH_PROFILES } from './models/telehealth-session.model';

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');

export const sessionIdParamSchema = z.object({ id: objectId });

export const createSessionBodySchema = z.object({
  appointmentId: objectId.optional(),
  providerId: objectId,
  patientId: objectId,
  patientUserId: objectId.optional(),
  scheduledStart: z.coerce.date(),
  bandwidthProfile: z.enum(BANDWIDTH_PROFILES).optional(),
  features: z
    .object({
      screenShare: z.boolean().optional(),
      chat: z.boolean().optional(),
      captions: z.boolean().optional(),
      recording: z.boolean().optional(),
    })
    .optional(),
  providerDisplayName: z.string().max(120).optional(),
  patientDisplayName: z.string().max(120).optional(),
});

export const joinSessionBodySchema = z.object({
  role: z.enum(['provider', 'patient', 'observer', 'interpreter']).default('patient'),
  displayName: z.string().min(1).max(120),
  ttlSeconds: z.coerce
    .number()
    .int()
    .min(300)
    .max(6 * 60 * 60)
    .optional(),
});

export const listSessionsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(['scheduled', 'active', 'ended', 'cancelled', 'archived']).optional(),
  providerId: objectId.optional(),
  patientId: objectId.optional(),
});

export const captionsBodySchema = z.object({ enabled: z.boolean() });

export const bandwidthBodySchema = z.object({ profile: z.enum(BANDWIDTH_PROFILES) });

export const cancelBodySchema = z.object({ reason: z.string().max(500).optional() });

// ── Recording ───────────────────────────────────────────────────────────────
export const initRecordingBodySchema = z.object({
  requiredConsentRoles: z
    .array(z.enum(['provider', 'patient']))
    .min(1)
    .optional(),
});

export const consentBodySchema = z.object({
  role: z.enum(['provider', 'patient']),
  consented: z.boolean(),
});

// ── Transcription ───────────────────────────────────────────────────────────
export const transcriptionBodySchema = z.object({
  recordingId: objectId.optional(),
  language: z.string().min(2).max(10).optional(),
});

// ── Chat ────────────────────────────────────────────────────────────────────
export const chatBodySchema = z.object({
  message: z.string().min(1).max(4000),
  senderName: z.string().min(1).max(120),
  senderRole: z.string().min(1).max(40),
});

export const archiveListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
