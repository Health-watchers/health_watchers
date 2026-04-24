import { z } from 'zod';

export const createAllergySchema = z.object({
  allergen:     z.string().min(1).max(200),
  allergenType: z.enum(['drug', 'food', 'environmental', 'other']),
  reaction:     z.string().min(1).max(500),
  severity:     z.enum(['mild', 'moderate', 'severe', 'life-threatening']),
  onsetDate:    z.string().datetime({ offset: true }).optional(),
});

export const updateAllergySchema = createAllergySchema.partial().extend({
  isActive: z.boolean().optional(),
}).refine((d) => Object.keys(d).length > 0, 'At least one field is required');

export type CreateAllergyDto = z.infer<typeof createAllergySchema>;
export type UpdateAllergyDto = z.infer<typeof updateAllergySchema>;
