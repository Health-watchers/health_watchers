/**
 * Shared request/response types for the Health Watchers API.
 *
 * These are intentionally thin — they mirror the fields the API actually
 * returns/accepts (see the `apps/api/src/modules/**` controllers and
 * transformers in the main repo) rather than fully mirroring every
 * server-side model.
 */

/** Generic envelope the API wraps successful responses in. */
export interface ApiSuccess<T> {
  status: 'success';
  data: T;
}

/** Generic envelope the API wraps error responses in. */
export interface ApiError {
  error: string;
  message: string;
  [key: string]: unknown;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext?: boolean;
  hasPrev?: boolean;
}

export interface PaginatedResponse<T> {
  status: 'success';
  data: T[];
  pagination: PaginationMeta;
}

// ── Auth ─────────────────────────────────────────────────────────────────────

/** Successful login: tokens are issued directly. */
export interface LoginSuccessData {
  accessToken: string;
  refreshToken: string;
  /** Present when the account is inside its MFA grace period but hasn't set up 2FA yet. */
  warning?: 'mfa_required';
  mfaGracePeriodEndsAt?: string;
}

/** Login halted because the account has MFA enabled — caller must complete an MFA challenge. */
export interface LoginMfaRequiredData {
  mfaRequired: true;
  tempToken: string;
}

export type LoginResponse =
  | { status: 'success'; data: LoginSuccessData }
  | { status: 'mfa_required'; data: LoginMfaRequiredData };

// ── Patients ─────────────────────────────────────────────────────────────────

export type PatientSex = 'M' | 'F' | 'O';

export interface Patient {
  id: string;
  systemId: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  sex: PatientSex;
  contactNumber?: string;
  address?: string;
  allergies: unknown[];
  insurance: unknown[];
  createdAt: string;
  updatedAt: string;
  photoUrl?: string;
  thumbnailUrl?: string;
  age?: number | null;
  ageGroup?: string | null;
}

export interface CreatePatientInput {
  firstName: string;
  lastName: string;
  /** ISO date string, e.g. "1990-05-14" */
  dateOfBirth: string;
  sex: PatientSex;
  contactNumber?: string;
  address?: string;
}

export interface ListPatientsParams {
  page?: number;
  limit?: number;
  /** Only honored for SUPER_ADMIN callers; other roles are always scoped to their own clinic. */
  clinicId?: string;
}

// ── Appointments ─────────────────────────────────────────────────────────────

export type AppointmentType = 'consultation' | 'follow-up' | 'procedure' | 'emergency';

export type AppointmentStatus =
  | 'scheduled'
  | 'confirmed'
  | 'cancelled'
  | 'patient_arrived'
  | 'completed'
  | 'no_show';

export interface Appointment {
  id: string;
  patientId: string;
  doctorId: string;
  clinicId: string;
  scheduledAt: string;
  duration: number;
  type: AppointmentType | string;
  status: AppointmentStatus | string;
  reason?: string;
  notes?: string;
  internalNotes?: string;
  videoCallUrl?: string;
  checkedInAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateAppointmentInput {
  patientId: string;
  doctorId: string;
  /** ISO 8601 datetime string. */
  scheduledAt: string;
  /** Minutes. Defaults to 30 server-side if omitted. */
  duration?: number;
  type: AppointmentType;
  chiefComplaint?: string;
  notes?: string;
}

export interface ListAppointmentsParams {
  doctorId?: string;
  patientId?: string;
  status?: AppointmentStatus;
  /** ISO 8601 datetime string. */
  dateFrom?: string;
  /** ISO 8601 datetime string. */
  dateTo?: string;
  page?: number;
  limit?: number;
}

// ── Payments ─────────────────────────────────────────────────────────────────

export type PaymentAssetCode = 'XLM' | 'USDC';

export type PaymentStatus = 'pending' | 'confirmed' | 'failed' | 'expired';

export interface PaymentIntent {
  id: string;
  intentId: string;
  patientId?: string;
  amount: string;
  assetCode: string;
  assetIssuer?: string;
  destination: string;
  memo?: string;
  status: PaymentStatus | string;
  txHash?: string;
  confirmedAt?: string;
  createdAt: string;
  updatedAt: string;
  sourceAssetCode?: string;
  sourceAssetIssuer?: string;
  destinationAmount?: string;
  maxSourceAmount?: string;
  path?: string[];
  /** Only present in the create-intent response, not on later reads. */
  platformPublicKey?: string;
  feeBump?: {
    xdr: string;
    hash: string;
    feeStroops: number;
  } | null;
}

export interface CreatePaymentIntentInput {
  /** Payment amount as a decimal string, e.g. "10.0000000". */
  amount: string;
  /** Stellar destination public key. */
  destination: string;
  /** MongoDB ObjectId of the patient this payment is associated with. */
  patientId?: string;
  /** Defaults to "XLM" server-side. */
  assetCode?: PaymentAssetCode;
  /** Alias for assetCode. */
  currency?: string;
  /** Required for non-XLM assets. */
  issuer?: string;
  sourceAssetCode?: string;
  sourceAssetIssuer?: string;
  destinationAmount?: string;
  maxSourceAmount?: string;
  path?: string[];
  feeStrategy?: string;
  sponsorFee?: boolean;
  idempotencyKey?: string;
}
