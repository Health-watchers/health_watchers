import { z } from 'zod';

const goalSchema = z.object({
  description: z.string().min(1),
  targetValue: z.string().optional(),
  targetDate: z.string().datetime().optional(),
  status: z.enum(['active', 'achieved', 'abandoned']).default('active'),
});

const interventionSchema = z.object({
  type: z.enum(['medication', 'lifestyle', 'monitoring', 'referral']),
  description: z.string().min(1),
  frequency: z.string().optional(),
});

const monitoringSchema = z.object({
  parameter: z.string().min(1),
  frequency: z.string().min(1),
  targetRange: z.string().optional(),
});

export const createCarePlanSchema = z.object({
  patientId: z.string().min(1),
  condition: z.string().min(1),
  icdCode: z.string().optional(),
  goals: z.array(goalSchema).default([]),
  interventions: z.array(interventionSchema).default([]),
  monitoringSchedule: z.array(monitoringSchema).default([]),
  reviewDate: z.string().datetime(),
});

export const updateCarePlanSchema = createCarePlanSchema
  .omit({ patientId: true })
  .extend({ status: z.enum(['active', 'completed', 'suspended']).optional() })
  .partial();

export const reviewCarePlanSchema = z.object({
  notes: z.string().optional(),
  nextReviewDate: z.string().datetime().optional(),
});

export const idParamSchema = z.object({ id: z.string().min(1) });

export type CreateCarePlanDto = z.infer<typeof createCarePlanSchema>;
export type UpdateCarePlanDto = z.infer<typeof updateCarePlanSchema>;
export type ReviewCarePlanDto = z.infer<typeof reviewCarePlanSchema>;
