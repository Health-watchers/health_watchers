import { z } from 'zod';

export const PatientSchema = z.object({
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().min(1, 'Last name is required'),
  dateOfBirth: z.string().min(1, 'Date of birth is required'),
  sex: z.enum(['M', 'F', 'O']),
  contactNumber: z.string().min(1, 'Contact number is required'),
  address: z.string().min(1, 'Address is required'),
});

export type PatientInput = z.infer<typeof PatientSchema>;

export interface Patient {
  _id: string;
  systemId: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  sex: 'M' | 'F' | 'O';
  contactNumber?: string;
  address?: string;
  gender?: string;
  phone?: string;
}

export function formatDate(dateStr: string | undefined): string {
  if (!dateStr) return 'N/A';
  return new Date(dateStr).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}
