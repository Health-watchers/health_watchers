import { z } from 'zod';
import { PatientSchema } from '@health-watchers/types';

export const createPatientSchema = PatientSchema.pick({
  firstName: true, lastName: true, dateOfBirth: true,
  sex: true, contactNumber: true, address: true,
});
export const patientIdParamsSchema    = z.object({ id: z.string().trim().min(1) });
export const patientSearchQuerySchema = z.object({
  q:     z.string().trim().min(1),
  page:  z.string().trim().optional(),
  limit: z.string().trim().optional(),
});

export type CreatePatientDto      = z.infer<typeof createPatientSchema>;
export type PatientIdParamsDto    = z.infer<typeof patientIdParamsSchema>;
export type PatientSearchQueryDto = z.infer<typeof patientSearchQuerySchema>;
