import { z } from 'zod';

export const createPaymentIntentSchema = z.object({
  patientId: z.string().regex(/^[a-f\d]{24}$/i, 'Invalid patientId'),
  amount:    z.string().regex(/^\d+(\.\d{1,2})?$/, 'amount must be a positive numeric string'),
});

export type CreatePaymentIntentDto = z.infer<typeof createPaymentIntentSchema>;
