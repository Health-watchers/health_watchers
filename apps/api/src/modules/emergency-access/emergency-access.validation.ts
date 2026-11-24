import { z } from 'zod';
import {
  EMERGENCY_ACCESS_REASONS,
  EMERGENCY_ACCESS_REVIEW_STATUSES,
} from './emergency-access.model';

export const MAX_EMERGENCY_ACCESS_MINUTES = 60;

export const requestEmergencyAccessSchema = z.object({
  reason: z.enum(EMERGENCY_ACCESS_REASONS),
  justification: z
    .string()
    .trim()
    .min(20, 'Describe the emergency in at least 20 characters')
    .max(1000),
  durationMinutes: z.coerce
    .number()
    .int()
    .min(5)
    .max(MAX_EMERGENCY_ACCESS_MINUTES)
    .default(MAX_EMERGENCY_ACCESS_MINUTES),
});

export const listEmergencyAccessQuerySchema = z.object({
  status: z.enum(EMERGENCY_ACCESS_REVIEW_STATUSES).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const reviewEmergencyAccessSchema = z.object({
  decision: z.enum(['APPROVED', 'FLAGGED']),
  notes: z.string().trim().max(2000).optional(),
});

export type RequestEmergencyAccessDto = z.infer<typeof requestEmergencyAccessSchema>;
export type ReviewEmergencyAccessDto = z.infer<typeof reviewEmergencyAccessSchema>;
