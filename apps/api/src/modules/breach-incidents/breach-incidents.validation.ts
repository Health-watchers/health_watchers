import { z } from 'zod';
import {
  breachSeverities,
  notificationStatuses,
  NotificationStatus,
} from './breach-incident.model';

export const createBreachIncidentSchema = z.object({
  discoveredAt: z.string().datetime('Invalid discoveredAt timestamp'),
  affectedPatients: z.array(z.string().min(1)).min(1, 'At least one affected patient is required'),
  description: z.string().min(1, 'Description is required'),
  severity: z.enum(breachSeverities),
});

export const updateBreachIncidentSchema = createBreachIncidentSchema.partial();

export const updateBreachIncidentStatusSchema = z.object({
  notificationStatus: z.enum(notificationStatuses),
});

/**
 * HIPAA notification workflow. Incidents move forward one step at a time;
 * a completed incident is terminal.
 */
export const ALLOWED_STATUS_TRANSITIONS: Record<NotificationStatus, NotificationStatus[]> = {
  PENDING: ['PATIENTS_NOTIFIED'],
  PATIENTS_NOTIFIED: ['HHS_NOTIFIED'],
  HHS_NOTIFIED: ['COMPLETE'],
  COMPLETE: [],
};

export function isAllowedStatusTransition(from: NotificationStatus, to: NotificationStatus) {
  return ALLOWED_STATUS_TRANSITIONS[from].includes(to);
}

export type CreateBreachIncidentInput = z.infer<typeof createBreachIncidentSchema>;
export type UpdateBreachIncidentInput = z.infer<typeof updateBreachIncidentSchema>;
