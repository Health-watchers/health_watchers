import { z } from 'zod';

export const triageAssessmentSchema = z.object({
  chiefComplaint: z.string().min(1),
  symptoms: z.array(z.string()),
  vitalSigns: z.object({
    heartRate: z.number().optional(),
    bloodPressure: z.string().optional(),
    temperature: z.number().optional(),
    oxygenSaturation: z.number().optional(),
  }),
  patientAge: z.number().min(0).max(150),
  patientSex: z.enum(['M', 'F']),
  onsetTime: z.string(),
});

export type TriageAssessmentInput = z.infer<typeof triageAssessmentSchema>;
