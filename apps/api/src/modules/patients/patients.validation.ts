import { z } from 'zod';

export const createPatientSchema = z.object({
  firstName:     z.string().min(1),
  lastName:      z.string().min(1),
  dateOfBirth:   z.string().min(1),
  sex:           z.enum(['M', 'F', 'O']),
  contactNumber: z.string().optional(),
  address:       z.string().optional(),
});

export const updatePatientSchema = createPatientSchema.partial();

export type CreatePatientDto = z.infer<typeof createPatientSchema>;
export type UpdatePatientDto = z.infer<typeof updatePatientSchema>;
