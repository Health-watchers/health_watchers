import { z } from 'zod';

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid ObjectId');

export const createEncounterSchema = z.object({
  patientId:      objectId,
  clinicId:       objectId,
  chiefComplaint: z.string().min(3, 'chiefComplaint must be at least 3 characters'),
  notes:          z.string().max(5000).optional(),
});

export const encounterIdParamSchema = z.object({
  id: objectId,
});

export const patientIdParamSchema = z.object({
  patientId: objectId,
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

export const updateEncounterSchema = createEncounterSchema.partial().refine(
  (d) => Object.keys(d).length > 0,
  'At least one field is required',
);

export type CreateEncounterDto = z.infer<typeof createEncounterSchema>;
export type UpdateEncounterDto = z.infer<typeof updateEncounterSchema>;
