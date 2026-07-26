import { z } from 'zod';
import { breachSeverities } from './breach-incident.model';

export const createBreachIncidentSchema = z.object({
  discoveredAt: z.string().datetime('Invalid discoveredAt timestamp'),
  affectedPatients: z.array(z.string().min(1)).min(1, 'At least one affected patient is required'),
  description: z.string().min(1, 'Description is required'),
  severity: z.enum(breachSeverities),
});

export type CreateBreachIncidentInput = z.infer<typeof createBreachIncidentSchema>;
