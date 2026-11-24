import { z } from 'zod';

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id');
const hhmm = z.string().regex(/^([01]?\d|2[0-3]):[0-5]\d$/, 'Expected HH:mm');
const isoDate = z
  .string()
  .datetime({ offset: true })
  .or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/));

const timeBlock = z
  .object({ start: hhmm, end: hhmm })
  .refine((b) => b.start < b.end, 'block start must be before end');

const dayHours = z.object({
  dayOfWeek: z.number().int().min(0).max(6),
  blocks: z.array(timeBlock).default([]),
});

const overrideSchema = z
  .object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    type: z.enum(['off', 'custom']),
    blocks: z.array(timeBlock).optional(),
    reason: z.string().max(500).optional(),
  })
  .refine((o) => o.type === 'off' || (o.blocks && o.blocks.length > 0), {
    message: 'custom overrides require at least one block',
  });

export const upsertAvailabilitySchema = z.object({
  providerId: objectId,
  timezone: z.string().min(1).max(64).optional(),
  weeklyHours: z.array(dayHours).max(7).optional(),
  slotDurationMinutes: z.number().int().min(5).max(240).optional(),
  bufferMinutes: z.number().int().min(0).max(120).optional(),
  maxDailyAppointments: z.number().int().min(0).max(200).optional(),
  overrides: z.array(overrideSchema).max(366).optional(),
  isActive: z.boolean().optional(),
});

export const slotsQuerySchema = z.object({
  providerId: objectId,
  from: isoDate,
  to: isoDate,
});

export const conflictsQuerySchema = z.object({
  providerId: objectId,
  start: isoDate,
  end: isoDate,
  excludeAppointmentId: objectId.optional(),
});

export const createTemplateSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(1000).optional(),
  weeklyHours: z.array(dayHours).max(7),
  slotDurationMinutes: z.number().int().min(5).max(240).optional(),
  bufferMinutes: z.number().int().min(0).max(120).optional(),
});

export const applyTemplateSchema = z.object({
  providerIds: z.array(objectId).min(1).max(100),
});

export const createRotationSchema = z.object({
  name: z.string().min(1).max(120),
  startDate: isoDate,
  cycleLengthDays: z.number().int().min(1).max(90),
  pattern: z
    .array(
      z.object({
        dayOffset: z.number().int().min(0),
        providerId: objectId,
        role: z.string().min(1).max(60),
      })
    )
    .min(1),
});

export const createTimeOffSchema = z
  .object({
    providerId: objectId,
    start: isoDate,
    end: isoDate,
    type: z.enum(['vacation', 'sick', 'conference', 'personal', 'other']),
    reason: z.string().max(1000).optional(),
  })
  .refine((v) => new Date(v.start) < new Date(v.end), 'start must be before end');

export const reviewTimeOffSchema = z.object({
  status: z.enum(['approved', 'denied', 'cancelled']),
  reviewNote: z.string().max(1000).optional(),
});

export const createOnCallSchema = z
  .object({
    providerId: objectId,
    start: isoDate,
    end: isoDate,
    role: z.enum(['primary', 'backup']).optional(),
    contact: z.string().max(120).optional(),
  })
  .refine((v) => new Date(v.start) < new Date(v.end), 'start must be before end');

export const optimizeSchema = z.object({
  date: isoDate,
  providerIds: z.array(objectId).min(1).max(100),
  demand: z.number().int().min(1).max(1000),
});

export const idParamSchema = z.object({ id: objectId });
