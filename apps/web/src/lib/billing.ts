import { fetchWithAuth } from '@/lib/auth';
import { API_V1 } from '@/lib/api';

export type ClaimStatus =
  | 'draft'
  | 'submitted'
  | 'accepted'
  | 'rejected'
  | 'paid'
  | 'resubmitted'
  | 'written_off';

export type BillingQueue = 'unbilled' | 'draft' | 'submitted' | 'denied' | 'accepted' | 'written_off';

/** Workbench queues → the claim statuses they contain (unbilled is encounters, not claims). */
export const QUEUE_STATUSES: Record<Exclude<BillingQueue, 'unbilled'>, ClaimStatus[]> = {
  draft: ['draft'],
  submitted: ['submitted', 'resubmitted'],
  denied: ['rejected'],
  accepted: ['accepted', 'paid'],
  written_off: ['written_off'],
};

export const QUEUES: { value: BillingQueue; label: string }[] = [
  { value: 'unbilled', label: 'Unbilled' },
  { value: 'draft', label: 'Ready to submit' },
  { value: 'submitted', label: 'Submitted' },
  { value: 'denied', label: 'Denied' },
  { value: 'accepted', label: 'Accepted / Paid' },
  { value: 'written_off', label: 'Written off' },
];

export const CLAIM_STATUS_LABEL: Record<ClaimStatus, string> = {
  draft: 'Draft',
  submitted: 'Submitted',
  resubmitted: 'Resubmitted',
  accepted: 'Accepted',
  paid: 'Paid',
  rejected: 'Denied',
  written_off: 'Written off',
};

export const CLAIM_STATUS_VARIANT: Record<
  ClaimStatus,
  'default' | 'primary' | 'success' | 'warning' | 'danger'
> = {
  draft: 'default',
  submitted: 'primary',
  resubmitted: 'primary',
  accepted: 'success',
  paid: 'success',
  rejected: 'danger',
  written_off: 'warning',
};

export interface PatientRef {
  _id: string;
  firstName?: string;
  lastName?: string;
  systemId?: string;
}

export interface ServiceLine {
  dateOfService: string;
  placeOfService?: string;
  cptCode: string;
  diagnosisPointers?: string[];
  charges: number;
  units: number;
}

export interface ClaimStatusEvent {
  status: ClaimStatus;
  at: string;
  by?: string;
  note?: string;
}

export interface ClaimAttachment {
  _id: string;
  name: string;
  url: string;
  mimeType?: string;
  uploadedAt: string;
}

export interface Claim {
  _id: string;
  encounterId: string;
  patientId: string | PatientRef;
  cptCodes: string[];
  diagnosisCodes: string[];
  totalAmount: number;
  status: ClaimStatus;
  cms1500Data?: {
    box2_patientName?: string;
    box3_patientDob?: string;
    box24_servicelines?: ServiceLine[];
    box33_billingProviderNpi?: string;
  };
  submittedAt?: string;
  rejectionReason?: string;
  resubmissionCount: number;
  writeOffReason?: string;
  statusHistory?: ClaimStatusEvent[];
  attachments?: ClaimAttachment[];
  createdAt: string;
  updatedAt: string;
}

export interface UnbilledEncounter {
  _id: string;
  patientId: string | PatientRef;
  attendingDoctorId?: string | { _id: string; fullName?: string };
  chiefComplaint?: string;
  diagnosis?: { code: string; description: string }[];
  billing?: { cptCodes?: { code: string; description: string; units: number; fee: string }[] };
  createdAt: string;
}

export interface ClaimCounts {
  unbilled: number;
  byStatus: Record<ClaimStatus, number>;
}

export interface AgingBucket {
  label: string;
  minDays: number;
  maxDays: number | null;
  encounters: { encounterId: string; daysUnbilled: number }[];
}

export function queueCount(counts: ClaimCounts | undefined, queue: BillingQueue): number | null {
  if (!counts) return null;
  if (queue === 'unbilled') return counts.unbilled;
  return QUEUE_STATUSES[queue].reduce((sum, s) => sum + (counts.byStatus[s] ?? 0), 0);
}

export function patientName(p: string | PatientRef | undefined): string {
  if (!p) return '—';
  if (typeof p === 'string') return p;
  const name = [p.firstName, p.lastName].filter(Boolean).join(' ');
  return name || p.systemId || p._id;
}

export function formatMoney(value: number): string {
  return value.toLocaleString(undefined, { style: 'currency', currency: 'USD' });
}

export async function billingFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetchWithAuth(`${API_V1}/billing${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.message ?? `Request failed (${res.status})`);
  return body as T;
}
