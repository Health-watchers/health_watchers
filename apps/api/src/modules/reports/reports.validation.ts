import { z } from 'zod';

export const reportQuerySchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
  period: z.string().optional(),
});

export const exportQuerySchema = z.object({
  type: z.enum(['patients', 'encounters', 'payments']),
  from: z.string(),
  to: z.string(),
});

export type ReportQuery = z.infer<typeof reportQuerySchema>;
export type ExportQuery = z.infer<typeof exportQuerySchema>;
