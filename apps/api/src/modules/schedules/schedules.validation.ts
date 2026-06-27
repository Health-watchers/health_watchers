
import { z } from 'zod';

// Time format validation (HH:mm)
const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;

export const createStaffScheduleSchema = z.object({
  userId: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid user ID'),
  date: z.string().optional(),
  dayOfWeek: z.number().min(0).max(6).optional(),
  startTime: z.string().regex(timeRegex, 'Invalid start time (must be HH:mm)'),
  endTime: z.string().regex(timeRegex, 'Invalid end time (must be HH:mm)'),
  isAvailable: z.boolean().optional().default(true),
  recurrence: z.enum(['none', 'daily', 'weekly', 'biweekly', 'monthly']).optional().default('none'),
  recurrenceEndDate: z.string().optional(),
  notes: z.string().optional(),
}).refine(data => {
  // Either date (for one-time) or dayOfWeek (for recurring) must be present
  return (data.date !== undefined) !== (data.dayOfWeek !== undefined);
}, 'Must provide either date (one-time) or dayOfWeek (recurring), but not both');

export const updateStaffScheduleSchema = createStaffScheduleSchema.partial();

export const staffScheduleIdParamsSchema = z.object({
  id: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid schedule ID'),
});

export const getStaffSchedulesQuerySchema = z.object({
  userId: z.string().regex(/^[0-9a-fA-F]{24}$/).optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  dayOfWeek: z.number().min(0).max(6).optional(),
});
