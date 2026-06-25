import { z } from 'zod';

const objectIdRegex = /^[a-f\d]{24}$/i;
const objectId = z.string().regex(objectIdRegex, 'Invalid ObjectId');

const sharedDataSchema = z.object({
  demographics: z.boolean().default(true),
  encounters: z.boolean().default(false),
  labResults: z.boolean().default(false),
  prescriptions: z.boolean().default(false),
});

export const createReferralSchema = z.object({
  toClinicId: objectId,
  patientId: objectId,
  reason: z.string().min(1, 'reason is required').max(1000),
  urgency: z.enum(['routine', 'urgent', 'emergency']),
  encounterId: objectId.optional(),
  sharedData: sharedDataSchema.optional(),
  notes: z.string().max(2000).optional(),
});

export const updateReferralStatusSchema = z.object({
  status: z.enum(['pending', 'accepted', 'declined', 'completed', 'cancelled']),
  notes: z.string().max(2000).optional(),
});

export const listReferralsQuerySchema = z.object({
  status: z.enum(['pending', 'accepted', 'declined', 'completed', 'cancelled']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const idParamSchema = z.object({ id: objectId });

export type CreateReferralDto = z.infer<typeof createReferralSchema>;
export type UpdateReferralStatusDto = z.infer<typeof updateReferralStatusSchema>;
export type ListReferralsQuery = z.infer<typeof listReferralsQuerySchema>;
