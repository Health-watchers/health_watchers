import { z } from 'zod';

// ── Breach incidents ────────────────────────────────────────────────────────
// Mirrors apps/api/src/modules/breach-incidents/{breach-incident.model,breach-incidents.validation}.ts

export const NOTIFICATION_STATUSES = [
  'PENDING',
  'PATIENTS_NOTIFIED',
  'HHS_NOTIFIED',
  'COMPLETE',
] as const;
export type NotificationStatus = (typeof NOTIFICATION_STATUSES)[number];

export const BREACH_SEVERITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;
export type BreachSeverity = (typeof BREACH_SEVERITIES)[number];

export const STATUS_LABELS: Record<NotificationStatus, string> = {
  PENDING: 'Pending',
  PATIENTS_NOTIFIED: 'Patients notified',
  HHS_NOTIFIED: 'HHS notified',
  COMPLETE: 'Complete',
};

/** Same table the API enforces in PATCH /admin/breach-incidents/:id/status. */
export const ALLOWED_STATUS_TRANSITIONS: Record<NotificationStatus, NotificationStatus[]> = {
  PENDING: ['PATIENTS_NOTIFIED'],
  PATIENTS_NOTIFIED: ['HHS_NOTIFIED'],
  HHS_NOTIFIED: ['COMPLETE'],
  COMPLETE: [],
};

export function isAllowedStatusTransition(from: NotificationStatus, to: NotificationStatus) {
  return ALLOWED_STATUS_TRANSITIONS[from].includes(to);
}

export interface BreachIncident {
  _id: string;
  discoveredAt: string;
  affectedPatients: string[];
  description: string;
  severity: BreachSeverity;
  notificationStatus: NotificationStatus;
  notificationDeadline: string;
  createdBy: string;
  createdAt?: string;
  updatedAt?: string;
}

export const breachIncidentSchema = z.object({
  discoveredAt: z.string().datetime('Invalid discoveredAt timestamp'),
  affectedPatients: z.array(z.string().min(1)).min(1, 'At least one affected patient is required'),
  description: z.string().min(1, 'Description is required'),
  severity: z.enum(BREACH_SEVERITIES),
});
export type BreachIncidentInput = z.infer<typeof breachIncidentSchema>;

/** Splits a free-text list of patient IDs (comma, whitespace or newline separated). */
export function parsePatientIds(raw: string): string[] {
  return Array.from(
    new Set(
      raw
        .split(/[\s,]+/)
        .map((s) => s.trim())
        .filter(Boolean)
    )
  );
}

const DAY_MS = 24 * 60 * 60 * 1000;

export interface Countdown {
  overdue: boolean;
  days: number;
  hours: number;
  label: string;
  tone: 'danger' | 'warning' | 'default' | 'success';
}

export function notificationCountdown(
  deadline: string,
  status: NotificationStatus,
  now: number = Date.now()
): Countdown {
  const diff = new Date(deadline).getTime() - now;
  const abs = Math.abs(diff);
  const days = Math.floor(abs / DAY_MS);
  const hours = Math.floor((abs % DAY_MS) / (60 * 60 * 1000));
  const overdue = diff < 0;

  if (status === 'COMPLETE') {
    return { overdue: false, days, hours, label: 'Notifications complete', tone: 'success' };
  }
  if (overdue) {
    return { overdue, days, hours, label: `Overdue by ${days}d ${hours}h`, tone: 'danger' };
  }
  const tone = days < 7 ? 'danger' : days < 21 ? 'warning' : 'default';
  return { overdue, days, hours, label: `${days}d ${hours}h left`, tone };
}

// ── Business Associate Agreements ───────────────────────────────────────────
// Mirrors apps/api/src/modules/compliance/baa.model.ts

export const BAA_STATUSES = ['signed', 'pending', 'expired'] as const;
export type BAAStatus = (typeof BAA_STATUSES)[number];

export interface BAA {
  _id: string;
  businessAssociate: string;
  status: BAAStatus;
  signedDate?: string;
  expiryDate?: string;
  documentUrl?: string;
  documentFileName?: string;
  notes?: string;
  updatedAt?: string;
}

export const BAA_EXPIRY_WARNING_DAYS = 30;

export type BAAExpiryState = 'expired' | 'expiring' | 'active' | 'none';

export function baaExpiry(
  baa: Pick<BAA, 'expiryDate' | 'status'>,
  now: number = Date.now()
): { state: BAAExpiryState; daysLeft: number | null } {
  if (!baa.expiryDate) {
    return { state: baa.status === 'expired' ? 'expired' : 'none', daysLeft: null };
  }
  const daysLeft = Math.ceil((new Date(baa.expiryDate).getTime() - now) / DAY_MS);
  if (daysLeft < 0 || baa.status === 'expired') return { state: 'expired', daysLeft };
  if (daysLeft <= BAA_EXPIRY_WARNING_DAYS) return { state: 'expiring', daysLeft };
  return { state: 'active', daysLeft };
}
