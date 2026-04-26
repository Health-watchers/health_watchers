import { z } from 'zod';

export const createScheduleSchema = z.object({
  userId: z.string().min(1, 'User ID is required'),
  date: z.string().datetime('Invalid date format'),
  shiftStart: z.string().regex(/^\d{2}:\d{2}$/, 'Invalid time format (HH:MM)'),
  shiftEnd: z.string().regex(/^\d{2}:\d{2}$/, 'Invalid time format (HH:MM)'),
  role: z.enum(['DOCTOR', 'NURSE', 'ASSISTANT']),
  isOnCall: z.boolean().optional().default(false),
  notes: z.string().optional(),
});

export const updateScheduleSchema = createScheduleSchema.partial();

export const listSchedulesQuerySchema = z.object({
  userId: z.string().optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  role: z.enum(['DOCTOR', 'NURSE', 'ASSISTANT']).optional(),
  status: z.enum(['scheduled', 'confirmed', 'absent', 'cancelled']).optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

export const coverageCheckSchema = z.object({
  date: z.string().datetime('Invalid date format'),
});

export type CreateScheduleInput = z.infer<typeof createScheduleSchema>;
export type UpdateScheduleInput = z.infer<typeof updateScheduleSchema>;
export type ListSchedulesQuery = z.infer<typeof listSchedulesQuerySchema>;
export type CoverageCheckInput = z.infer<typeof coverageCheckSchema>;
