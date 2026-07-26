import { z } from 'zod';

const paymentInstructionSchema = z.object({
  destination: z.string().regex(/^G[A-Z0-9]{55}$/, 'Invalid Stellar public key'),
  amount: z.string().regex(/^\d+(\.\d{1,7})?$/, 'Invalid amount format'),
  memo: z.string().max(28).optional(),
});

export const createBatchPaymentSchema = z.object({
  payments: z
    .array(paymentInstructionSchema)
    .min(1, 'At least one payment is required')
    .max(100, 'Maximum 100 payments per batch'),
  currency: z.enum(['XLM', 'USDC']),
});

export type CreateBatchPaymentInput = z.infer<typeof createBatchPaymentSchema>;
