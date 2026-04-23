import { z } from 'zod';

const appointmentTypes = ['consultation', 'follow-up', 'procedure', 'emergency'] as const;
const appointmentStatuses = ['scheduled', 'confirmed', 'cancelled', 'completed', 'no-show'] as const;

export const createAppointmentSchema = z.object({
  patientId:      z.string().min(1),
  doctorId:       z.string().min(1),
  scheduledAt:    z.string().datetime(),
  duration:       z.number().int().positive().default(30),
  type:           z.enum(appointmentTypes),
  chiefComplaint: z.string().optional(),
  notes:          z.string().optional(),
});

export const updateAppointmentSchema = z.object({
  scheduledAt:    z.string().datetime().optional(),
  duration:       z.number().int().positive().optional(),
  type:           z.enum(appointmentTypes).optional(),
  status:         z.enum(appointmentStatuses).optional(),
  chiefComplaint: z.string().optional(),
  notes:          z.string().optional(),
  encounterId:    z.string().optional(),
});

export const cancelAppointmentSchema = z.object({
  cancellationReason: z.string().min(1, 'Cancellation reason is required'),
});

export const appointmentIdParamsSchema = z.object({ id: z.string().min(1) });
export const doctorIdParamsSchema      = z.object({ doctorId: z.string().min(1) });

export const listAppointmentsQuerySchema = z.object({
  doctorId:  z.string().optional(),
  patientId: z.string().optional(),
  status:    z.enum(appointmentStatuses).optional(),
  dateFrom:  z.string().datetime().optional(),
  dateTo:    z.string().datetime().optional(),
  page:      z.coerce.number().int().positive().default(1),
  limit:     z.coerce.number().int().positive().max(100).default(20),
});

export const availabilityQuerySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD'),
});

export type CreateAppointmentDto      = z.infer<typeof createAppointmentSchema>;
export type UpdateAppointmentDto      = z.infer<typeof updateAppointmentSchema>;
export type CancelAppointmentDto      = z.infer<typeof cancelAppointmentSchema>;
export type ListAppointmentsQueryDto  = z.infer<typeof listAppointmentsQuerySchema>;
