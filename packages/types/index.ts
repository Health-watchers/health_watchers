import { z } from 'zod';

export const PatientSchema = z.object({
  firstName:     z.string().trim().min(1),
  lastName:      z.string().trim().min(1),
  dateOfBirth:   z.string().trim().min(1),
  sex:           z.enum(['M', 'F', 'O']),
  contactNumber: z.string().trim().min(1),
  address:       z.string().trim().min(1),
});
export type Patient = z.infer<typeof PatientSchema>;

export type AppRole = 'SUPER_ADMIN' | 'CLINIC_ADMIN' | 'DOCTOR' | 'NURSE' | 'ASSISTANT' | 'READ_ONLY';

export interface AuthenticatedUser {
  userId: string;
  role: AppRole;
  clinicId: string;
}

export type TokenUser = AuthenticatedUser;
