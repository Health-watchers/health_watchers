import { z } from 'zod';
import { stellarPublicKey, mongoObjectId, icd10Code, cptCode, shortName, notesField, emailField, monetaryAmount, paginationLimit, paginationOffset } from './validators';

export const PaginationSchema = z.object({ limit: paginationLimit, offset: paginationOffset }).strict();

export const IdParamSchema = z.object({ id: mongoObjectId }).strict();

export const CreatePaymentIntentSchema = z.object({
  patientId:   mongoObjectId,
  amount:      monetaryAmount,
  currency:    z.enum(['XLM', 'USDC']),
  feeStrategy: z.enum(['slow', 'standard', 'fast']).default('standard'),
  description: z.string().max(255).trim().optional(),
  memo:        z.string().max(28).trim().optional(),
}).strict();

export const CreateHealthLogSchema = z.object({
  metricType: z.enum(['weight', 'blood_pressure', 'blood_glucose', 'exercise_minutes', 'heart_rate']),
  value:     z.number().positive().max(100_000),
  unit:      z.string().min(1).max(20).trim(),
  loggedAt:  z.string().datetime().optional(),
  notes:     notesField,
}).strict();

export const UpdateBillingStatusSchema = z.object({
  status:          z.enum(['unbilled', 'billed', 'paid', 'denied', 'resubmitted']),
  rejectionReason: z.string().max(500).trim().optional(),
}).strict();

export const DexTradeSchema = z.object({
  sellAsset:          z.enum(['XLM', 'USDC']),
  buyAsset:           z.enum(['XLM', 'USDC']),
  sellAmount:         monetaryAmount,
  expectedPrice:      z.number().positive(),
  maxSlippagePercent: z.number().min(0).max(50).default(1),
}).strict().refine(d => d.sellAsset !== d.buyAsset, {
  message: 'sellAsset and buyAsset must differ',
  path: ['buyAsset'],
});
