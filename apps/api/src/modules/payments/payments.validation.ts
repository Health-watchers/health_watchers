import { z } from 'zod';

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid ObjectId');

export const createPaymentSchema = z.object({
  intentId:    z.string().min(1),
  amount:      z.string().regex(/^\d+(\.\d+)?$/, 'amount must be a positive numeric string').refine(
    (v) => parseFloat(v) > 0,
    'amount must be greater than 0'
  ),
  destination: z.string().min(1),
  memo:        z.string().optional(),
  clinicId:    z.string().optional(),
  patientId:   objectId,
});

export const paymentIdParamSchema = z.object({
  id: objectId,
});
export const createPaymentIntentSchema = z.object({
  patientId: z.string().regex(/^[a-f\d]{24}$/i, 'Invalid patientId'),
  amount:    z.string().regex(/^\d+(\.\d{1,2})?$/, 'amount must be a positive numeric string'),
});

export type CreatePaymentIntentDto = z.infer<typeof createPaymentIntentSchema>;
