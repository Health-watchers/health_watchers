import { z } from 'zod';

const objectIdRegex = /^[a-f\d]{24}$/i;
const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid ObjectId');

const vitalSignsSchema = z
  .object({
    bloodPressure: z.string().optional(),
    heartRate: z.number().positive().optional(),
    temperature: z.number().positive().optional(),
    respiratoryRate: z.number().positive().optional(),
    oxygenSaturation: z.number().min(0).max(100).optional(),
    weight: z.number().positive().optional(),
    height: z.number().positive().optional(),
  })
  .optional();

const diagnosisSchema = z.object({
  code: z.string().min(1, 'Diagnosis code is required'),
  description: z.string().min(1, 'Diagnosis description is required'),
  isPrimary: z.boolean().optional(),
});

const prescriptionSchema = z.object({
  medication: z.string().min(1, 'Medication name is required'),
  dosage: z.string().min(1, 'Dosage is required'),
  frequency: z.string().min(1, 'Frequency is required'),
  duration: z.string().optional(),
  notes: z.string().max(1000).optional(),
});

export const createEncounterSchema = z.object({
  patientId:         z.string().regex(objectIdRegex, 'Invalid patientId'),
  clinicId:          z.string().regex(objectIdRegex, 'Invalid clinicId'),
  attendingDoctorId: z.string().regex(objectIdRegex, 'Invalid attendingDoctorId'),
  chiefComplaint:    z.string().min(3, 'chiefComplaint must be at least 3 characters'),
  status:            z.enum(['open', 'closed', 'follow-up']).optional(),
  notes:             z.string().max(5000).optional(),
  treatmentPlan:     z.string().max(5000).optional(),
  diagnosis:         z.array(diagnosisSchema).optional(),
  vitalSigns:        vitalSignsSchema,
  prescriptions:     z.array(prescriptionSchema).optional(),
  followUpDate:      z.string().datetime({ offset: true }).optional(),
  aiSummary:         z.string().max(5000).optional(),
});

export const encounterIdParamSchema = z.object({
  id: objectId,
});

export const patientIdParamSchema = z.object({
  patientId: objectId,
});

export const prescriptionIdParamSchema = z.object({
  id:             objectId,
  prescriptionId: objectId,
});

export { prescriptionSchema };

export const updateEncounterSchema = createEncounterSchema.partial().refine(
  (d) => Object.keys(d).length > 0,
  'At least one field is required',
);

export const listEncountersQuerySchema = z.object({
  patientId: objectId.optional(),
  doctorId: objectId.optional(),
  status: z.enum(['open', 'closed', 'follow-up']).optional(),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD')
    .optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type CreateEncounterDto = z.infer<typeof createEncounterSchema>;
export type UpdateEncounterDto = z.infer<typeof updateEncounterSchema>;
export type ListEncountersQuery = z.infer<typeof listEncountersQuerySchema>;
