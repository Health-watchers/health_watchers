import { fetchWithAuth } from '@/lib/auth';
import { API_V1 } from '@/lib/api';

export type ClaimStatus =
  | 'draft'
  | 'submitted'
  | 'accepted'
  | 'rejected'
  | 'denied'
  | 'paid'
  | 'resubmitted'
  | 'written_off';

export type BillingQueue = 'unbilled' | 'draft' | 'submitted' | 'denied' | 'accepted' | 'written_off';

/** Workbench queues → the claim statuses they contain (unbilled is encounters, not claims). */
export const QUEUE_STATUSES: Record<Exclude<BillingQueue, 'unbilled'>, ClaimStatus[]> = {
  draft: ['draft'],
  submitted: ['submitted', 'resubmitted'],
  denied: ['rejected', 'denied'],
  accepted: ['accepted', 'paid'],
  written_off: ['written_off'],
};

export const QUEUES: { value: BillingQueue; label: string }[] = [
  { value: 'unbilled', label: 'Unbilled' },
  { value: 'draft', label: 'Ready to submit' },
  { value: 'submitted', label: 'Submitted' },
  { value: 'denied', label: 'Rejected / Denied' },
  { value: 'accepted', label: 'Accepted / Paid' },
  { value: 'written_off', label: 'Written off' },
];

export const CLAIM_STATUS_LABEL: Record<ClaimStatus, string> = {
  draft: 'Draft',
  submitted: 'Submitted',
  resubmitted: 'Resubmitted',
  accepted: 'Accepted',
  paid: 'Paid',
  rejected: 'Rejected',
  denied: 'Denied',
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
  denied: 'danger',
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

export type ClearinghouseProvider = 'availity' | 'change_healthcare' | 'mock';

export const CLEARINGHOUSE_LABEL: Record<ClearinghouseProvider, string> = {
  availity: 'Availity',
  change_healthcare: 'Change Healthcare',
  mock: 'Test clearinghouse',
};

export interface RemittanceAdjustment {
  groupCode: 'CO' | 'PR' | 'OA' | 'PI' | 'CR';
  reasonCode: string;
  amount: number;
  remarkCode?: string;
}

export interface ClaimRemittance {
  _id?: string;
  eraId: string;
  payerName?: string;
  checkNumber?: string;
  paymentMethod?: 'ACH' | 'CHK' | 'NON';
  claimStatusCode?: string;
  billedAmount: number;
  allowedAmount?: number;
  paidAmount: number;
  patientResponsibility: number;
  adjustments: RemittanceAdjustment[];
  receivedAt: string;
  postedAt?: string;
}

export interface ClaimCorrection {
  at: string;
  by?: string;
  note?: string;
  changes: Record<string, { from: unknown; to: unknown }>;
}

export interface ClaimFieldError {
  field: string;
  message: string;
}

export interface ClaimValidationResult {
  valid: boolean;
  errors: ClaimFieldError[];
}

/** CAS group codes on an 835 remittance */
export const ADJUSTMENT_GROUP_LABEL: Record<RemittanceAdjustment['groupCode'], string> = {
  CO: 'Contractual obligation',
  PR: 'Patient responsibility',
  OA: 'Other adjustment',
  PI: 'Payer initiated',
  CR: 'Correction / reversal',
};

/** Statuses a user can set by hand from the claim page (others have dedicated actions). */
export const MANUAL_TRANSITIONS: Partial<Record<ClaimStatus, ClaimStatus[]>> = {
  submitted: ['accepted', 'rejected'],
  resubmitted: ['accepted', 'rejected'],
};

export const CORRECTABLE_STATUSES: ClaimStatus[] = ['draft', 'rejected', 'denied'];
export const RESUBMITTABLE_STATUSES: ClaimStatus[] = ['rejected', 'denied'];
export const REMITTABLE_STATUSES: ClaimStatus[] = [
  'submitted',
  'resubmitted',
  'accepted',
  'paid',
  'denied',
];

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
  clearinghouse?: {
    provider: ClearinghouseProvider;
    submissionId?: string;
    payerClaimId?: string;
    lastStatus?: string;
    lastCheckedAt?: string;
  };
  remittances?: ClaimRemittance[];
  paidAmount?: number;
  paidAt?: string;
  acceptedAt?: string;
  denialReason?: string;
  corrections?: ClaimCorrection[];
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

export interface EraDashboard {
  summary: {
    remittanceCount: number;
    billed: number;
    allowed: number;
    paid: number;
    patientResponsibility: number;
    adjustments: number;
    denialRate: number;
    collectionRate: number;
  };
  byStatus: Partial<Record<ClaimStatus, { count: number; amount: number }>>;
  topAdjustments: {
    groupCode: RemittanceAdjustment['groupCode'];
    reasonCode: string;
    count: number;
    amount: number;
  }[];
  remittances: {
    claimId: string;
    claimStatus: ClaimStatus;
    patient?: PatientRef;
    remittance: ClaimRemittance;
  }[];
  meta: { total: number; page: number; limit: number };
}

/** API error carrying CMS-1500 field errors from a 422 validation response. */
export class BillingError extends Error {
  readonly fieldErrors: ClaimFieldError[];

  constructor(message: string, fieldErrors?: ClaimFieldError[]) {
    const detail = fieldErrors?.length
      ? `: ${fieldErrors
          .slice(0, 3)
          .map((e) => `box ${e.field} — ${e.message}`)
          .join('; ')}${fieldErrors.length > 3 ? '…' : ''}`
      : '';
    super(`${message}${detail}`);
    this.name = 'BillingError';
    this.fieldErrors = fieldErrors ?? [];
  }
}

/** Downloads a claim's CMS-1500 PDF through the authenticated API. */
export async function downloadCms1500(claimId: string): Promise<void> {
  const res = await fetchWithAuth(
    `${API_V1}/billing/claims/${encodeURIComponent(claimId)}/cms1500.pdf`
  );
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message ?? `Download failed (${res.status})`);
  }
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement('a');
  a.href = url;
  a.download = `cms1500-${claimId}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function billingFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetchWithAuth(`${API_V1}/billing${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new BillingError(body.message ?? `Request failed (${res.status})`, body.data?.errors);
  return body as T;
}
