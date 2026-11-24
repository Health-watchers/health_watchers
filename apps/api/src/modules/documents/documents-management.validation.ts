import { z } from 'zod';

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id');

export const idParamSchema = z.object({ id: objectId });
export const grantParamSchema = z.object({ id: objectId, grantId: objectId });

export const searchQuerySchema = z.object({
  q: z.string().max(300).optional(),
  tags: z.string().max(300).optional(), // comma-separated
  documentType: z
    .enum(['lab_result', 'referral_letter', 'consent_form', 'medical_image', 'other'])
    .optional(),
  patientId: objectId.optional(),
  includeExpired: z.enum(['true', 'false']).optional(),
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

export const createGrantSchema = z.object({
  userId: objectId,
  permission: z.enum(['read', 'write']).optional(),
  expiresAt: z.string().datetime({ offset: true }).optional(),
  reason: z.string().max(500).optional(),
});

export const assignRetentionSchema = z
  .object({
    retentionDays: z.number().int().min(1).max(36525).optional(),
    policyId: objectId.optional(),
  })
  .refine((v) => v.retentionDays != null || v.policyId != null, {
    message: 'Provide retentionDays or policyId',
  });

export const createPolicySchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(1000).optional(),
  documentTypes: z
    .array(z.enum(['lab_result', 'referral_letter', 'consent_form', 'medical_image', 'other']))
    .max(5)
    .optional(),
  retentionDays: z.number().int().min(1).max(36525),
  action: z.enum(['expire', 'archive', 'purge']).optional(),
  purgeAfterDays: z.number().int().min(0).max(3650).optional(),
  legalHold: z.boolean().optional(),
});

export const updateMetadataSchema = z.object({
  tags: z.array(z.string().min(1).max(40)).max(30).optional(),
  description: z.string().max(2000).optional(),
  accessLevel: z.enum(['clinic', 'restricted', 'private']).optional(),
  allowedRoles: z.array(z.string().min(1).max(40)).max(20).optional(),
});
