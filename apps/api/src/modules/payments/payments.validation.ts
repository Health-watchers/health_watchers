import { z } from 'zod';

export const createPaymentIntentSchema = z.object({
  amount: z
    .union([z.string(), z.number()])
    .refine((v) => Number.isFinite(Number(v)) && Number(v) > 0, 'amount must be a positive number')
    .transform((v) => String(v)),
});
export const paymentIntentIdParamsSchema = z.object({ intentId: z.string().trim().min(1) });

export type CreatePaymentIntentDto  = z.infer<typeof createPaymentIntentSchema>;
export type PaymentIntentIdParamsDto = z.infer<typeof paymentIntentIdParamsSchema>;
