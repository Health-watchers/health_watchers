import { z } from 'zod';

export const objectIdSchema = z.object({
  id: z.string().regex(/^[a-f\d]{24}$/i, 'Invalid ObjectId'),
});

export const patientIdParamSchema = z.object({
  patientId: z.string().regex(/^[a-f\d]{24}$/i, 'Invalid ObjectId'),
});
