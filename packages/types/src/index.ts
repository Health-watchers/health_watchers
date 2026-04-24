import { z } from 'zod';

export const PatientSchema = z.object({
  firstName: z.string().min(1, 'First name is required').max(100, 'First name is too long'),
  lastName: z.string().min(1, 'Last name is required').max(100, 'Last name is too long'),
  dateOfBirth: z
    .string()
    .min(1, 'Date of birth is required')
    .refine(
      (val) => {
        const date = new Date(val);
        return !isNaN(date.getTime()) && date < new Date();
      },
      { message: 'Date of birth must be a valid past date' }
    ),
  sex: z.enum(['M', 'F', 'O'], {
    errorMap: () => ({ message: 'Please select a sex' }),
  }),
  contactNumber: z
    .string()
    .min(1, 'Contact number is required')
    .regex(/^\+?[0-9\s\-().]{7,20}$/, 'Enter a valid phone number (e.g. +1 555 123 4567)'),
  address: z.string().min(1, 'Address is required').max(300, 'Address is too long'),
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
