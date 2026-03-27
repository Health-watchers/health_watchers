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
  patientId:      z.string().regex(/^[a-f\d]{24}$/i, 'Invalid patientId'),
  clinicId:       z.string().regex(/^[a-f\d]{24}$/i, 'Invalid clinicId'),
  chiefComplaint: z.string().min(3, 'chiefComplaint must be at least 3 characters'),
  notes:          z.string().max(5000).optional(),
  treatmentPlan:  z.string().max(5000).optional(),
});

export const updateEncounterSchema = createEncounterSchema.partial().refine(
  (d) => Object.keys(d).length > 0,
  'At least one field is required',
);

export type CreateEncounterDto = z.infer<typeof createEncounterSchema>;
export type UpdateEncounterDto = z.infer<typeof updateEncounterSchema>;
