import { z } from 'zod';

const objectIdRegex = /^[a-f\d]{24}$/i;
const objectId = z.string().regex(objectIdRegex, 'Invalid ObjectId');

export const verifyInsuranceSchema = z.object({
  patientId: objectId,
  invoiceId: objectId.optional(),
});

export const listVerificationsQuerySchema = z.object({
  patientId: objectId.optional(),
  status: z.enum(['in_progress', 'verified', 'not_verified', 'error']).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const latestVerificationQuerySchema = z.object({
  patientId: objectId,
});

export const idParamSchema = z.object({ id: objectId });

export type VerifyInsuranceDto = z.infer<typeof verifyInsuranceSchema>;
export type ListVerificationsQuery = z.infer<typeof listVerificationsQuerySchema>;
