import { z } from 'zod';

export const createEncounterSchema = z.object({
  patientId:      z.string().trim().min(1),
  chiefComplaint: z.string().trim().min(1),
  notes:          z.string().trim().optional(),
});
export const encounterIdParamsSchema = z.object({ id: z.string().trim().min(1) });
export const patientEncountersParamsSchema = z.object({ patientId: z.string().trim().min(1) });
export const paginationQuerySchema = z.object({
  page:  z.string().trim().optional(),
  limit: z.string().trim().optional(),
});

export type CreateEncounterDto           = z.infer<typeof createEncounterSchema>;
export type EncounterIdParamsDto         = z.infer<typeof encounterIdParamsSchema>;
export type PatientEncountersParamsDto   = z.infer<typeof patientEncountersParamsSchema>;
export type PaginationQueryDto           = z.infer<typeof paginationQuerySchema>;
