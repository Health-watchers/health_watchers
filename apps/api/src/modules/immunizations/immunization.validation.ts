import { z } from 'zod';

const administrationRoutes = [
  'Intramuscular',
  'Subcutaneous',
  'Intradermal',
  'Oral',
  'Intranasal',
  'Intravenous',
] as const;

const administrationSites = [
  'Left deltoid',
  'Right deltoid',
  'Left thigh',
  'Right thigh',
  'Left arm',
  'Right arm',
  'Oral',
  'Nasal',
  'Other',
] as const;

const adverseReactionSchema = z.object({
  description: z.string().min(1).max(1000),
  severity: z.enum(['mild', 'moderate', 'severe', 'life-threatening']),
  onsetDate: z.string().datetime(),
  resolvedDate: z.string().datetime().optional(),
  reportedToVAERS: z.boolean().default(false),
});

export const createImmunizationSchema = z.object({
  vaccineName: z.string().min(1).max(200).trim(),
  vaccineCode: z.string().min(1).max(10).trim(),
  manufacturer: z.string().max(200).trim().optional(),
  lotNumber: z.string().max(100).trim().optional(),
  administeredDate: z.string().datetime(),
  expiryDate: z.string().datetime().optional(),
  doseNumber: z.number().int().min(1).max(20),
  seriesComplete: z.boolean().default(false),
  site: z.enum(administrationSites).optional(),
  route: z.enum(administrationRoutes).optional(),
  adverseReaction: adverseReactionSchema.optional(),
  notes: z.string().max(2000).trim().optional(),
});

export const updateImmunizationSchema = z.object({
  vaccineName: z.string().min(1).max(200).trim().optional(),
  vaccineCode: z.string().min(1).max(10).trim().optional(),
  manufacturer: z.string().max(200).trim().optional(),
  lotNumber: z.string().max(100).trim().optional(),
  administeredDate: z.string().datetime().optional(),
  expiryDate: z.string().datetime().optional(),
  doseNumber: z.number().int().min(1).max(20).optional(),
  seriesComplete: z.boolean().optional(),
  site: z.enum(administrationSites).optional(),
  route: z.enum(administrationRoutes).optional(),
  adverseReaction: adverseReactionSchema.optional(),
  notes: z.string().max(2000).trim().optional(),
});

export const immunizationParamsSchema = z.object({
  id: z.string().min(1),
  immunizationId: z.string().min(1).optional(),
});

export const listImmunizationsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  vaccineCode: z.string().optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});

export type CreateImmunizationDto = z.infer<typeof createImmunizationSchema>;
export type UpdateImmunizationDto = z.infer<typeof updateImmunizationSchema>;
export type ListImmunizationsQueryDto = z.infer<typeof listImmunizationsQuerySchema>;
