import { z } from 'zod';

const dateOfBirth = z
  .string()
  .min(1, 'Date of birth is required')
  .refine((v) => !isNaN(Date.parse(v)), { message: 'Invalid date format' })
  .refine((v) => new Date(v) <= new Date(), { message: 'Date of birth cannot be in the future' })
  .refine(
    (v) => {
      const age = (Date.now() - new Date(v).getTime()) / (1000 * 60 * 60 * 24 * 365.25);
      return age < 150;
    },
    { message: 'Patient age must be less than 150 years' },
  );

// Accepts E.164 (+1234567890) or common local formats (digits, spaces, dashes, parens)
const contactNumber = z
  .string()
  .regex(/^\+?[\d\s\-().]{7,20}$/, 'Invalid phone number format')
  .optional();

export const createPatientSchema = z.object({
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().min(1, 'Last name is required'),
  dateOfBirth,
  sex: z.enum(['M', 'F', 'O']),
  contactNumber,
  address: z.string().optional(),
});

export const updatePatientSchema = createPatientSchema
  .partial()
  .refine((d) => Object.keys(d).length > 0, { message: 'At least one field is required' });

export const patientQuerySchema = z.object({
  page:     z.coerce.number().int().min(1).optional(),
  limit:    z.coerce.number().int().min(1).max(100).optional(),
  clinicId: z.string().optional(),
});

export const patientSearchQuerySchema = patientQuerySchema.extend({
  q: z.string().optional(),
});

export type CreatePatientDto = z.infer<typeof createPatientSchema>;
export type UpdatePatientDto = z.infer<typeof updatePatientSchema>;
