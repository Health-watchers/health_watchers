/**
 * @health-watchers/types — Shared TypeScript types for the Health Watchers monorepo
 *
 * This is the SINGLE source of truth for shared types.
 * All apps (api, web, mobile, stellar-service) and packages import from here.
 *
 * Issue #928: Consolidated from stale compiled artifacts (root index.ts / index.d.ts)
 * and the src/index.ts source. The root-level artifacts have been removed from git
 * tracking — see packages/types in .gitignore.
 */

import { z } from 'zod';

// ─── Patient ─────────────────────────────────────────────────────────────────

/**
 * Zod schema for patient creation / update form validation (used in web app).
 */
export const PatientSchema = z.object({
  firstName: z.string().min(1, 'First name is required').max(100, 'First name is too long'),
  lastName: z.string().min(1, 'Last name is required').max(100, 'Last name is too long'),
  dateOfBirth: z
    .string()
    .min(1, 'Date of birth is required')
    .refine(
      (val) => {
        const date = new Date(val);
        return !isNaN(date.getTime()) && date < new Date();
      },
      { message: 'Date of birth must be a valid past date' }
    ),
  sex: z.enum(['M', 'F', 'O'], {
    errorMap: () => ({ message: 'Please select a sex' }),
  }),
  contactNumber: z
    .string()
    .min(1, 'Contact number is required')
    .regex(/^\+?[0-9\s\-().]{7,20}$/, 'Enter a valid phone number (e.g. +1 555 123 4567)'),
  address: z.string().min(1, 'Address is required').max(300, 'Address is too long'),
});

/** Inferred type for patient form inputs — matches PatientSchema. */
export type PatientInput = z.infer<typeof PatientSchema>;

/**
 * Shared Patient interface — represents a patient as returned by the API.
 * The canonical Mongoose model lives in apps/api/src/modules/patients/models/patient.model.ts.
 * This interface covers the serialised view consumed by the web / mobile apps.
 */
export interface Patient {
  _id: string;
  systemId: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  sex: 'M' | 'F' | 'O';
  contactNumber?: string;
  address?: string;
  /** @deprecated Use `sex` instead — kept for backward compatibility with older API consumers */
  gender?: string;
  /** @deprecated Use `contactNumber` instead — kept for backward compatibility */
  phone?: string;
  clinicId?: string;
  isActive?: boolean;
  riskScore?: number;
  riskLevel?: 'low' | 'medium' | 'high' | 'critical';
  createdAt?: string;
  updatedAt?: string;
}

// ─── Runtime Type Guards and API Responses ─────────────────────────────────────

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export interface ApiErrorDetail {
  path?: string;
  message: string;
}

export interface ApiErrorResponse {
  error: string;
  code: ApiErrorCode;
  message: string;
  requestId?: string;
  details?: ApiErrorDetail[];
  field?: string;
  stack?: string;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function isError(value: unknown): value is Error {
  return value instanceof Error;
}

export function isApiErrorResponse(value: unknown): value is ApiErrorResponse {
  return (
    isRecord(value) &&
    typeof value.error === 'string' &&
    typeof value.code === 'string' &&
    typeof value.message === 'string'
  );
}

// ─── Date Utilities (re-exported from @health-watchers/utils) ──────────────

export {
  formatDate,
  formatDateTime,
  formatScheduleDate,
  formatTime,
  calculateAge,
  calculateAgeInMonths,
  getAgeGroup,
  type AgeGroup,
} from '@health-watchers/utils';

// ─── Payment Dispute Types ────────────────────────────────────────────────────
// Consolidated from stale packages/types/index.ts (issue #928).

export type DisputeReason =
  | 'duplicate_payment'
  | 'service_not_rendered'
  | 'incorrect_amount'
  | 'other';

export type DisputeStatus =
  | 'open'
  | 'under_review'
  | 'resolved_refund'
  | 'resolved_no_action'
  | 'closed';

export interface PaymentDispute {
  id: string;
  paymentIntentId: string;
  clinicId: string;
  patientId: string;
  reason: DisputeReason;
  description: string;
  status: DisputeStatus;
  openedBy: string;
  openedAt: string;
  resolvedBy?: string;
  resolvedAt?: string;
  resolutionNotes?: string;
  refundIntentId?: string;
}

export interface OpenDisputeRequest {
  patientId: string;
  reason: DisputeReason;
  description: string;
}

export interface ResolveDisputeRequest {
  status: 'resolved_refund' | 'resolved_no_action' | 'closed';
  resolutionNotes?: string;
}

export interface IssueRefundRequest {
  amount: string;
  destinationPublicKey: string;
}

// ─── API Error Codes ──────────────────────────────────────────────────────────

export enum ApiErrorCode {
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  UNAUTHORIZED = 'UNAUTHORIZED',
  FORBIDDEN = 'FORBIDDEN',
  NOT_FOUND = 'NOT_FOUND',
  PATIENT_NOT_FOUND = 'PATIENT_NOT_FOUND',
  ENCOUNTER_NOT_FOUND = 'ENCOUNTER_NOT_FOUND',
  PAYMENT_FAILED = 'PAYMENT_FAILED',
  INTERNAL_SERVER_ERROR = 'INTERNAL_SERVER_ERROR',
  CONFLICT = 'CONFLICT',
  RATE_LIMITED = 'RATE_LIMITED',
  TOKEN_EXPIRED = 'TOKEN_EXPIRED',
  INVALID_TOKEN = 'INVALID_TOKEN',
  ACCOUNT_LOCKED = 'ACCOUNT_LOCKED',
  MFA_REQUIRED = 'MFA_REQUIRED',
  UNSUPPORTED_MEDIA_TYPE = 'UNSUPPORTED_MEDIA_TYPE',
  BAD_REQUEST = 'BAD_REQUEST',
}

// ─── Staff Management ─────────────────────────────────────────────────────────

/** Roles that can be assigned to clinic staff accounts. */
export const STAFF_ROLES = [
  'SUPER_ADMIN',
  'CLINIC_ADMIN',
  'DOCTOR',
  'NURSE',
  'ASSISTANT',
  'READ_ONLY',
] as const;

export type StaffRole = (typeof STAFF_ROLES)[number];

/** Roles a CLINIC_ADMIN may invite or assign; SUPER_ADMIN may assign any role. */
export const CLINIC_ADMIN_ASSIGNABLE_ROLES: readonly StaffRole[] = [
  'DOCTOR',
  'NURSE',
  'ASSISTANT',
  'READ_ONLY',
];

/** Validation for inviting a staff member (web invite form + API POST /users). */
export const InviteStaffSchema = z.object({
  fullName: z.string().trim().min(1, 'Full name is required').max(100, 'Full name is too long'),
  email: z.string().trim().email('Invalid email address'),
  role: z.enum(STAFF_ROLES),
  clinicId: z.string().optional(),
});

export type InviteStaffInput = z.infer<typeof InviteStaffSchema>;

/** Validation for updating a staff member (API PUT /users/:id). */
export const UpdateStaffSchema = z.object({
  fullName: z.string().trim().min(1).max(100).optional(),
  role: z.enum(STAFF_ROLES).optional(),
});

export type UpdateStaffInput = z.infer<typeof UpdateStaffSchema>;

/** Staff member as returned by GET /users. */
export interface StaffMember {
  id: string;
  fullName: string;
  email: string;
  role: StaffRole;
  clinicId: string;
  isActive: boolean;
  emailVerified?: boolean;
  mfaEnabled?: boolean;
  createdAt: string;
  updatedAt?: string;
}

// ─── Appointment Status (Issue #1643) ────────────────────────────────────────
// Canonical source for the magic strings previously duplicated across
// apps/api/src/modules/appointments's model, controller, and validation files.

export const APPOINTMENT_STATUSES = [
  'scheduled',
  'confirmed',
  'cancelled',
  'completed',
  'no-show',
  'patient_arrived',
] as const;

export type AppointmentStatus = (typeof APPOINTMENT_STATUSES)[number];

// ─── Encounter Status (Issue #1643) ──────────────────────────────────────────

export const ENCOUNTER_STATUSES = [
  'open',
  'closed',
  'follow-up',
  'cancelled',
  'pending_cosignature',
] as const;

export type EncounterStatus = (typeof ENCOUNTER_STATUSES)[number];

// ─── Payment Record Status (Issue #1643) ─────────────────────────────────────
// Status of an individual payment record. Not to be confused with
// `DisputeStatus` above, which tracks a dispute opened against a payment.

export const PAYMENT_STATUSES = ['pending', 'confirmed', 'failed'] as const;

export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

// ─── Notification Types (Issue #1643) ────────────────────────────────────────
// Canonical source; apps/api/src/modules/notifications/notification.model.ts
// imports this instead of maintaining its own copy.

export const NOTIFICATION_TYPES = [
  'referral_received',
  'payment_confirmed',
  'appointment_reminder',
  'appointment_status_update',
  'ai_summary_ready',
  'lab_result_ready',
  'high_risk_patient',
  'system',
  'balance_low_warning',
  'balance_critical',
  'large_transaction',
  'unrecognized_transaction',
  'waitlist_available',
  'claimable_expiring',
  'subscription_warning',
  'follow_up_reminder',
  'report_ready',
] as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

// ─── Real-time (Socket.IO) Event Contract (Issue #1504) ──────────────────────

export * from './realtime';
