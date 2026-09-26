import { z } from 'zod';

const objectIdRegex = /^[a-f\d]{24}$/i;
const objectId = z.string().regex(objectIdRegex, 'Invalid ObjectId');

// ── Conflict check ───────────────────────────────────────────────────────────
export const conflictCheckSchema = z.object({
  patientId: objectId,
  vaccineCode: z.string().min(1).max(10),
  doseNumber: z.number().int().min(1).max(20),
  administeredDate: z.string().datetime(),
  lotNumber: z.string().max(100).optional(),
});

// ── Immunity status ──────────────────────────────────────────────────────────
export const immunityStatusQuerySchema = z.object({
  patientId: objectId,
});

// ── Analytics ────────────────────────────────────────────────────────────────
export const analyticsQuerySchema = z.object({
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
});

// ── Lots ─────────────────────────────────────────────────────────────────────
export const createLotSchema = z.object({
  lotNumber: z.string().min(1).max(100).trim(),
  vaccineCode: z.string().min(1).max(10).trim(),
  vaccineName: z.string().min(1).max(200).trim(),
  manufacturer: z.string().min(1).max(200).trim(),
  supplier: z.string().max(200).trim().optional(),
  expiryDate: z.string().datetime(),
  quantityReceived: z.number().int().positive(),
  reorderThreshold: z.number().int().min(0).default(10),
  notes: z.string().max(2000).optional(),
});

export const listLotsQuerySchema = z.object({
  vaccineCode: z.string().optional(),
  status: z.enum(['active', 'low', 'depleted', 'expired', 'recalled']).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100),
});

export const receiveLotSchema = z.object({
  quantity: z.number().int().positive(),
});

export const adjustLotSchema = z.object({
  kind: z.enum(['administered', 'wasted']),
  quantity: z.number().int().positive(),
});

export const recallLotSchema = z.object({
  reason: z.string().min(1).max(2000),
});

// ── Adverse events ───────────────────────────────────────────────────────────
const severityEnum = z.enum(['mild', 'moderate', 'severe', 'life-threatening']);
const outcomeEnum = z.enum(['recovered', 'recovering', 'ongoing', 'fatal', 'unknown']);

export const reportAdverseEventSchema = z.object({
  patientId: objectId,
  immunizationId: objectId.optional(),
  vaccineCode: z.string().min(1).max(10),
  vaccineName: z.string().min(1).max(200),
  lotNumber: z.string().max(100).optional(),
  description: z.string().min(1).max(2000),
  severity: severityEnum,
  onsetDate: z.string().datetime(),
  resolvedDate: z.string().datetime().optional(),
  outcome: outcomeEnum.default('unknown'),
  reportedToVAERS: z.boolean().default(false),
  vaersReportId: z.string().max(100).optional(),
  notes: z.string().max(2000).optional(),
});

export const updateAdverseEventSchema = z.object({
  resolvedDate: z.string().datetime().optional(),
  outcome: outcomeEnum.optional(),
  reportedToVAERS: z.boolean().optional(),
  vaersReportId: z.string().max(100).optional(),
  notes: z.string().max(2000).optional(),
});

export const listAdverseEventsQuerySchema = z.object({
  patientId: objectId.optional(),
  vaccineCode: z.string().optional(),
  severity: severityEnum.optional(),
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

// ── Recalls ──────────────────────────────────────────────────────────────────
export const createRecallSchema = z.object({
  lotId: objectId,
  reason: z.string().min(1).max(2000),
  severity: z.enum(['low', 'medium', 'high', 'critical']),
  patientsNotified: z.boolean().default(false),
});

export const listRecallsQuerySchema = z.object({
  status: z.enum(['active', 'resolved']).optional(),
  lotNumber: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export const idParamSchema = z.object({ id: objectId });

export type CreateLotDto = z.infer<typeof createLotSchema>;
export type ReportAdverseEventDto = z.infer<typeof reportAdverseEventSchema>;
export type CreateRecallDto = z.infer<typeof createRecallSchema>;
