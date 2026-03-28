import { z } from 'zod';

const objectIdRegex = /^[a-f\d]{24}$/i;

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid ObjectId');

export const createPaymentSchema = z.object({
  intentId: z.string().min(1),
  // eslint-disable-next-line security/detect-unsafe-regex -- anchored regex with limited input is safe
  amount: z
    .string()
    .regex(/^\d+(\.\d+)?$/, 'amount must be a positive numeric string')
    .refine((v) => parseFloat(v) > 0, 'amount must be greater than 0'),
  destination: z.string().min(1),
  memo: z.string().optional(),
  clinicId: z.string().optional(),
  patientId: objectId,
});

export const paymentIdParamSchema = z.object({
  id: objectId,
});

export const createPaymentIntentSchema = z.object({
  patientId: z.string().regex(objectIdRegex, 'Invalid patientId'),
  amount:    z.string().regex(/^\d+(\.\d{1,2})?$/, 'amount must be a positive numeric string'),
  patientId: z.string().regex(/^[a-f\d]{24}$/i, 'Invalid patientId'),
  // eslint-disable-next-line security/detect-unsafe-regex -- anchored regex with limited input is safe
  amount: z.string().regex(/^\d+(\.\d{1,7})?$/, 'amount must be a positive numeric string'),
  destination: z.string().min(1, 'destination is required'),
  memo: z.string().optional(),
  patientId: z.string().regex(/^[a-f\d]{24}$/i, 'Invalid patientId').optional(),
  assetCode: z.string().optional().default('XLM'),
  issuer: z.string().optional(),
});

export const confirmPaymentSchema = z.object({
  intentId: z.string().min(1, 'intentId is required'),
  txHash: z.string().min(1, 'txHash is required'),
});

export const listPaymentsQuerySchema = z.object({
  patientId: z.string().regex(objectIdRegex, 'Invalid patientId').optional(),
  status:    z.enum(['pending', 'confirmed', 'failed']).optional(),
  page:      z.coerce.number().int().min(1).default(1),
  limit:     z.coerce.number().int().min(1).max(100).default(20),
});

export type CreatePaymentIntentDto = z.infer<typeof createPaymentIntentSchema>;
export type ListPaymentsQuery      = z.infer<typeof listPaymentsQuerySchema>;
export type ConfirmPaymentDto = z.infer<typeof confirmPaymentSchema>;
