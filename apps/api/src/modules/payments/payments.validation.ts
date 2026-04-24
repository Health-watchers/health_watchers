import { z } from 'zod';

const objectIdRegex = /^[a-f\d]{24}$/i;

export const createPaymentIntentSchema = z.object({
  patientId: z.string().regex(objectIdRegex, 'Invalid patientId').optional(),
  amount: z.string().regex(/^\d+(\.\d{1,7})?$/, 'amount must be a positive numeric string'),
  destination: z.string().min(1, 'destination is required'),
  memo: z.string().optional(),
  /** 'XLM' | 'USDC' — defaults to 'XLM' */
  currency: z.enum(['XLM', 'USDC']).optional(),
  assetCode: z.string().optional().default('XLM'),
  issuer: z.string().optional(),
});

export const confirmPaymentSchema = z.object({
  txHash: z.string().min(1, 'txHash is required'),
});

export const confirmPaymentParamsSchema = z.object({
  intentId: z.string().min(1, 'intentId is required'),
});

export const listPaymentsQuerySchema = z.object({
  patientId: z.string().regex(objectIdRegex, 'Invalid patientId').optional(),
  status: z.enum(['pending', 'confirmed', 'failed']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type CreatePaymentIntentDto = z.infer<typeof createPaymentIntentSchema>;
export type ListPaymentsQuery = z.infer<typeof listPaymentsQuerySchema>;
export type ConfirmPaymentDto = z.infer<typeof confirmPaymentSchema>;
export type ConfirmPaymentParamsDto = z.infer<typeof confirmPaymentParamsSchema>;
