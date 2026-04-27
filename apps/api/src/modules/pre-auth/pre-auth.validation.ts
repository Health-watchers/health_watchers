import { z } from 'zod';

const objectIdRegex = /^[a-f\d]{24}$/i;

export const createPreAuthSchema = z.object({
  patientId: z.string().regex(objectIdRegex, 'Invalid patientId'),
  encounterId: z.string().regex(objectIdRegex, 'Invalid encounterId').optional(),
  procedureCode: z.string().min(1, 'procedureCode (CPT) is required'),
  estimatedAmount: z
    .string()
    .regex(/^\d+(\.\d{1,7})?$/, 'estimatedAmount must be a positive numeric string'),
  insuranceProvider: z.string().min(1, 'insuranceProvider is required'),
  /** Patient's Stellar public key — funds are locked here as claimable balance */
  patientPublicKey: z.string().min(1, 'patientPublicKey is required'),
});

export const approvePreAuthSchema = z.object({
  preAuthNumber: z.string().min(1, 'preAuthNumber is required'),
});

export type CreatePreAuthDto = z.infer<typeof createPreAuthSchema>;
export type ApprovePreAuthDto = z.infer<typeof approvePreAuthSchema>;
