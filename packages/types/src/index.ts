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

// ─── Date Utilities ───────────────────────────────────────────────────────────

/** Format a date string for display (e.g. "Jan 1, 2024"). */
export function formatDate(dateStr: string | undefined): string {
  if (!dateStr) return 'N/A';
  return new Date(dateStr).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

// ─── Age Calculation Utilities (Issue #396) ──────────────────────────────────

export type AgeGroup = 'infant' | 'toddler' | 'child' | 'adolescent' | 'adult' | 'elderly';

export function calculateAge(dateOfBirth: Date | string): number {
  const dob = new Date(dateOfBirth);
  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const monthDiff = today.getMonth() - dob.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) age--;
  return age;
}

export function calculateAgeInMonths(dateOfBirth: Date | string): number {
  const dob = new Date(dateOfBirth);
  const today = new Date();
  return (today.getFullYear() - dob.getFullYear()) * 12 + (today.getMonth() - dob.getMonth());
}

export function getAgeGroup(age: number): AgeGroup {
  if (age < 1) return 'infant';
  if (age < 3) return 'toddler';
  if (age < 12) return 'child';
  if (age < 18) return 'adolescent';
  if (age < 65) return 'adult';
  return 'elderly';
}

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
