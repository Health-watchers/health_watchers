import { z } from 'zod';

export const PatientSchema = z.object({
  firstName:     z.string().trim().min(1),
  lastName:      z.string().trim().min(1),
  dateOfBirth:   z.string().trim().min(1),
  sex:           z.enum(['M', 'F', 'O']),
  contactNumber: z.string().trim().min(1),
  address:       z.string().trim().min(1),
});
export type PatientFormData = z.infer<typeof PatientSchema>;

export interface Patient {
  _id: string;
  systemId: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string | Date;
  sex: 'M' | 'F' | 'O';
  contactNumber?: string;
  address?: string;
  isActive?: boolean;
  clinicId?: string;
  createdAt?: string;
}

export function formatDate(isoString: string | Date): string {
  if (!isoString) return 'N/A';
  try {
    return new Date(isoString).toLocaleDateString('en-US', {
      year: 'numeric', month: 'short', day: 'numeric',
    });
  } catch {
    return 'N/A';
  }
}

export type AppRole = 'SUPER_ADMIN' | 'CLINIC_ADMIN' | 'DOCTOR' | 'NURSE' | 'ASSISTANT' | 'READ_ONLY';

export interface AuthenticatedUser {
  userId: string;
  role: AppRole;
  clinicId: string;
}
