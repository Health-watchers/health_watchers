import { z } from 'zod';

const objectIdRegex = /^[a-f\d]{24}$/i;
const objectId = z.string().regex(objectIdRegex, 'Invalid ObjectId');

const labResultItemSchema = z.object({
  name: z.string().min(1, 'Result name is required'),
  value: z.string().min(1, 'Result value is required'),
  unit: z.string().optional(),
  referenceRange: z.string().optional(),
  flag: z.enum(['normal', 'high', 'low', 'critical']).optional(),
});

export const orderLabResultSchema = z.object({
  patientId: objectId,
  encounterId: objectId.optional(),
  testName: z.string().min(1, 'testName is required').max(200),
  testCode: z.string().max(50).optional(),
  notes: z.string().max(1000).optional(),
});

export const enterLabResultsSchema = z.object({
  results: z.array(labResultItemSchema).min(1, 'At least one result is required'),
  notes: z.string().max(1000).optional(),
  attachmentUrl: z.string().url('Invalid attachment URL').optional(),
});

export const listLabResultsQuerySchema = z.object({
  patientId: objectId.optional(),
  status: z.enum(['ordered', 'collected', 'resulted', 'reviewed']).optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});

export const idParamSchema = z.object({ id: objectId });

export type OrderLabResultDto = z.infer<typeof orderLabResultSchema>;
export type EnterLabResultsDto = z.infer<typeof enterLabResultsSchema>;
export type ListLabResultsQuery = z.infer<typeof listLabResultsQuerySchema>;
