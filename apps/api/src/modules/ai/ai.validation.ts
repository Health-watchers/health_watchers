import { z } from 'zod';

const bloodPressurePattern = /^\d{2,3}\/\d{2,3}$/;

export const differentialDiagnosisRequestSchema = z.object({
  chiefComplaint: z.string().trim().min(5).max(500),
  symptoms: z.array(z.string().trim().min(2).max(200)).min(1).max(20),
  vitalSigns: z
    .object({
      heartRate: z.number().int().positive().max(250).optional(),
      bloodPressure: z.string().trim().regex(bloodPressurePattern, 'bloodPressure must be e.g. 120/80').optional(),
      oxygenSaturation: z.number().min(0).max(100).optional(),
      temperature: z.number().min(30).max(45).optional(),
    })
    .optional(),
  patientAge: z.number().int().min(0).max(130).optional(),
  patientSex: z.preprocess(
    (value) => (typeof value === 'string' ? value.trim().toUpperCase() : value),
    z.enum(['M', 'F', 'O', 'U']).optional()
  ),
  relevantHistory: z.string().trim().max(2000).optional(),
});

export type DifferentialDiagnosisRequestDto = z.infer<typeof differentialDiagnosisRequestSchema>;

export const dosageCalculatorRequestSchema = z.object({
  drugName: z.string().trim().min(1).max(200),
  patientWeight: z.number().positive().max(500),
  patientAge: z.number().int().min(0).max(130),
  patientSex: z.enum(['M', 'F']),
  indication: z.string().trim().min(2).max(500),
  renalFunction: z.enum(['normal', 'mild_impairment', 'moderate_impairment', 'severe_impairment']).optional(),
  hepaticFunction: z.enum(['normal', 'impaired']).optional(),
});

export type DosageCalculatorRequestDto = z.infer<typeof dosageCalculatorRequestSchema>;
