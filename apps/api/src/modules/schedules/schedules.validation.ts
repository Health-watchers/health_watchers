import { z } from 'zod';

// Time format validation (HH:mm)
const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;

const staffScheduleBaseSchema = z.object({
  userId: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid user ID'),
  date: z.string().optional(),
  dayOfWeek: z.number().min(0).max(6).optional(),
  startTime: z.string().regex(timeRegex, 'Invalid start time (must be HH:mm)'),
  endTime: z.string().regex(timeRegex, 'Invalid end time (must be HH:mm)'),
  isAvailable: z.boolean().optional().default(true),
  recurrence: z.enum(['none', 'daily', 'weekly', 'biweekly', 'monthly']).optional().default('none'),
  recurrenceEndDate: z.string().optional(),
  notes: z.string().optional(),
});

export const createStaffScheduleSchema = staffScheduleBaseSchema.refine((data) => {
  // Either date (for one-time) or dayOfWeek (for recurring) must be present
  return (data.date !== undefined) !== (data.dayOfWeek !== undefined);
}, 'Must provide either date (one-time) or dayOfWeek (recurring), but not both');

// ZodEffects (from .refine) has no .partial(), so derive updates from the base object.
// Defaults are dropped so a partial update never resets isAvailable/recurrence.
export const updateStaffScheduleSchema = staffScheduleBaseSchema
  .extend({
    isAvailable: z.boolean().optional(),
    recurrence: z.enum(['none', 'daily', 'weekly', 'biweekly', 'monthly']).optional(),
  })
  .partial();

export const staffScheduleIdParamsSchema = z.object({
  id: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid schedule ID'),
});

export const getStaffSchedulesQuerySchema = z.object({
  userId: z
    .string()
    .regex(/^[0-9a-fA-F]{24}$/)
    .optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  dayOfWeek: z.number().min(0).max(6).optional(),
});
