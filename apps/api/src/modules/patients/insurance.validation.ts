import { z } from 'zod';

const isoDate = z
  .string()
  .refine((v) => !isNaN(Date.parse(v)), { message: 'Invalid date format' })
  .optional();

export const createInsuranceSchema = z.object({
  provider: z.string().min(1, 'Provider is required').max(200),
  policyNumber: z.string().min(1, 'Policy number is required').max(100),
  groupNumber: z.string().max(100).optional(),
  coverageType: z.enum(['HMO', 'PPO', 'EPO', 'POS', 'HDHP', 'Medicare', 'Medicaid', 'other']),
  effectiveDate: isoDate,
  expirationDate: isoDate,
  isPrimary: z.boolean().default(false),
});

export const updateInsuranceSchema = createInsuranceSchema
  .partial()
  .refine((d) => Object.keys(d).length > 0, { message: 'At least one field is required' });

export type CreateInsuranceDto = z.infer<typeof createInsuranceSchema>;
export type UpdateInsuranceDto = z.infer<typeof updateInsuranceSchema>;
