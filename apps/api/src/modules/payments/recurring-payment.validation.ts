import { z } from 'zod';

export const createRecurringPaymentSchema = z.object({
  patientId: z.string(),
  amount: z.string(),
  currency: z.enum(['XLM', 'USDC']).default('XLM'),
  frequency: z.enum(['weekly', 'monthly', 'quarterly', 'annually']),
  startDate: z.string().datetime(),
  endDate: z.string().datetime().optional(),
  description: z.string().optional(),
});

export const updateRecurringPaymentSchema = z.object({
  amount: z.string().optional(),
  frequency: z.enum(['weekly', 'monthly', 'quarterly', 'annually']).optional(),
  endDate: z.string().datetime().optional(),
  description: z.string().optional(),
});

export type CreateRecurringPaymentInput = z.infer<typeof createRecurringPaymentSchema>;
export type UpdateRecurringPaymentInput = z.infer<typeof updateRecurringPaymentSchema>;
