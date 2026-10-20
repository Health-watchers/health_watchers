import { z } from 'zod';

const allergySchema = z.object({
  allergen: z.string().min(1).max(200),
  severity: z.enum(['mild', 'moderate', 'severe', 'life-threatening']).optional(),
  reaction: z.string().max(500).optional(),
});

export const checkInteractionsBodySchema = z.object({
  medications: z
    .array(z.string().min(1).max(200))
    .min(1, 'At least one medication is required')
    .max(50),
  allergies: z.array(allergySchema).optional(),
  includeFood: z.boolean().optional(),
  patientId: z.string().optional(),
});

export const resolveDrugParamsSchema = z.object({
  name: z.string().min(1).max(200),
});

export const lookupDrugQuerySchema = z.object({
  q: z.string().min(1).max(200),
});

export const analyticsQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(365).optional(),
});

export type CheckInteractionsInput = z.infer<typeof checkInteractionsBodySchema>;
