/**
 * @module errors
 * @description Pre-built, user-friendly AppError instances and factory helpers.
 *
 * Issue #1064 — Improve Error Messages
 *
 * Goals:
 *  1. Actionable — tell the user what to do, not just what went wrong.
 *  2. Consistent — every error follows the same tone and format.
 *  3. Safe — no internal details (stack traces, DB errors) in production.
 *  4. Typed — error codes align with `ApiErrorCode` in `@health-watchers/types`.
 *
 * Usage:
 *   import { Errors } from '@api/utils/errors';
 *   throw Errors.auth.invalidCredentials();
 *   throw Errors.patient.notFound(patientId);
 *   throw Errors.payment.insufficientBalance(required, actual);
 */

import { AppError } from './app-error';
import { ApiErrorCode } from '@health-watchers/types';

// ─── Auth Errors ──────────────────────────────────────────────────────────────

const auth = {
  /**
   * Generic invalid credentials — deliberately vague to prevent user enumeration.
   */
  invalidCredentials: () =>
    new AppError('Invalid email or password. Please check your credentials and try again.', 401, {
      severity: 'low',
      category: 'authentication',
      code: ApiErrorCode.UNAUTHORIZED,
    }),

  /**
   * Account has been locked after too many failed attempts.
   */
  accountLocked: (unlockAfterMinutes?: number) => {
    const hint = unlockAfterMinutes
      ? ` Your account will be unlocked in ${unlockAfterMinutes} minute(s).`
      : ' Please contact support to unlock your account.';
    return new AppError(
      `Your account has been locked due to too many failed login attempts.${hint}`,
      401,
      {
        severity: 'medium',
        category: 'authentication',
        code: ApiErrorCode.ACCOUNT_LOCKED,
      }
    );
  },

  /**
   * MFA verification code is invalid or has expired.
   */
  invalidMfaCode: () =>
    new AppError(
      'The verification code you entered is incorrect or has expired. Please generate a new code from your authenticator app and try again.',
      401,
      { severity: 'low', category: 'authentication', code: ApiErrorCode.UNAUTHORIZED }
    ),

  /**
   * MFA is required for this account but has not been set up.
   */
  mfaRequired: () =>
    new AppError(
      'Multi-factor authentication is required for your role. Please set up an authenticator app in your account settings.',
      403,
      { severity: 'medium', category: 'authorization', code: ApiErrorCode.MFA_REQUIRED }
    ),

  /**
   * Access token is missing from the request.
   */
  tokenMissing: () =>
    new AppError(
      'Authentication token is missing. Please log in and include the token in the Authorization header.',
      401,
      { severity: 'low', category: 'authentication', code: ApiErrorCode.UNAUTHORIZED }
    ),

  /**
   * JWT has expired.
   */
  tokenExpired: () =>
    new AppError('Your session has expired. Please log in again to continue.', 401, {
      severity: 'low',
      category: 'authentication',
      code: ApiErrorCode.TOKEN_EXPIRED,
    }),

  /**
   * JWT signature is invalid or the token has been tampered with.
   */
  tokenInvalid: () =>
    new AppError('The authentication token is invalid. Please log in again.', 401, {
      severity: 'low',
      category: 'authentication',
      code: ApiErrorCode.INVALID_TOKEN,
    }),

  /**
   * Refresh token is missing, expired, or has already been used.
   */
  refreshTokenInvalid: () =>
    new AppError('Your session is no longer valid. Please log in again.', 401, {
      severity: 'low',
      category: 'authentication',
      code: ApiErrorCode.INVALID_TOKEN,
    }),

  /**
   * User does not have the required role for this action.
   */
  insufficientPermissions: (requiredRole?: string) => {
    const hint = requiredRole ? ` This action requires the "${requiredRole}" role.` : '';
    return new AppError(
      `You do not have permission to perform this action.${hint} Contact your clinic administrator if you believe this is a mistake.`,
      403,
      { severity: 'medium', category: 'authorization', code: ApiErrorCode.FORBIDDEN }
    );
  },

  /**
   * Password does not meet the complexity requirements.
   */
  weakPassword: () =>
    new AppError(
      'Password must be at least 8 characters long and include uppercase letters, lowercase letters, numbers, and a special character.',
      400,
      { severity: 'low', category: 'validation', code: ApiErrorCode.VALIDATION_ERROR }
    ),

  /**
   * Password reset token has expired.
   */
  passwordResetTokenExpired: () =>
    new AppError(
      'This password reset link has expired. Please request a new one from the login page.',
      400,
      { severity: 'low', category: 'authentication', code: ApiErrorCode.BAD_REQUEST }
    ),
};

// ─── Patient Errors ───────────────────────────────────────────────────────────

const patient = {
  notFound: (id?: string) => {
    const hint = id ? ` (ID: ${id})` : '';
    return new AppError(
      `Patient${hint} was not found. Please verify the patient ID or search for the patient by name.`,
      404,
      { severity: 'low', category: 'not_found', code: ApiErrorCode.PATIENT_NOT_FOUND }
    );
  },

  duplicateSystemId: (systemId: string) =>
    new AppError(
      `A patient with system ID "${systemId}" already exists in this clinic. Please check for duplicate registrations.`,
      409,
      { severity: 'low', category: 'conflict', code: ApiErrorCode.CONFLICT }
    ),

  /**
   * Attempt to create or update a patient with an age that is invalid.
   */
  invalidDateOfBirth: () =>
    new AppError(
      'Date of birth must be a valid date in the past. Future dates are not allowed.',
      400,
      { severity: 'low', category: 'validation', code: ApiErrorCode.VALIDATION_ERROR }
    ),

  maxAllergiesReached: (max: number) =>
    new AppError(
      `A patient can have a maximum of ${max} allergy records. Remove an existing allergy before adding a new one.`,
      400,
      { severity: 'low', category: 'validation', code: ApiErrorCode.BAD_REQUEST }
    ),

  maxInsuranceReached: (max: number) =>
    new AppError(
      `A patient can have a maximum of ${max} insurance records. Remove an existing entry before adding a new one.`,
      400,
      { severity: 'low', category: 'validation', code: ApiErrorCode.BAD_REQUEST }
    ),

  alreadyMerged: () =>
    new AppError(
      'This patient record has already been merged into another record and cannot be modified directly. Please access the target record.',
      409,
      { severity: 'low', category: 'conflict', code: ApiErrorCode.CONFLICT }
    ),
};

// ─── Encounter Errors ─────────────────────────────────────────────────────────

const encounter = {
  notFound: (id?: string) => {
    const hint = id ? ` (ID: ${id})` : '';
    return new AppError(
      `Encounter${hint} was not found. Please check the encounter ID and try again.`,
      404,
      { severity: 'low', category: 'not_found', code: ApiErrorCode.ENCOUNTER_NOT_FOUND }
    );
  },

  alreadySignedOff: () =>
    new AppError(
      'This encounter has already been signed off and cannot be edited. Contact a clinic administrator to reopen it.',
      409,
      { severity: 'low', category: 'conflict', code: ApiErrorCode.CONFLICT }
    ),

  invalidDiagnosisCode: (code: string) =>
    new AppError(
      `"${code}" is not a valid or active ICD-10 diagnosis code. Please search for a valid code using the diagnosis code lookup.`,
      400,
      { severity: 'low', category: 'validation', code: ApiErrorCode.VALIDATION_ERROR }
    ),
};

// ─── Payment Errors ───────────────────────────────────────────────────────────

const payment = {
  notFound: (id?: string) => {
    const hint = id ? ` (ID: ${id})` : '';
    return new AppError(
      `Payment record${hint} was not found. Please verify the payment ID and try again.`,
      404,
      { severity: 'low', category: 'not_found', code: ApiErrorCode.NOT_FOUND }
    );
  },

  failed: (reason?: string) => {
    const detail = reason ? ` Reason: ${reason}.` : '';
    return new AppError(
      `Payment processing failed.${detail} Please try again or contact support if the problem persists.`,
      402,
      { severity: 'high', category: 'external', code: ApiErrorCode.PAYMENT_FAILED }
    );
  },

  insufficientBalance: (required?: string, available?: string) => {
    const detail =
      required && available ? ` Required: ${required} XLM, available: ${available} XLM.` : '';
    return new AppError(
      `Insufficient wallet balance to complete this payment.${detail} Please top up your Stellar wallet and try again.`,
      402,
      { severity: 'medium', category: 'validation', code: ApiErrorCode.PAYMENT_FAILED }
    );
  },

  alreadyConfirmed: () =>
    new AppError('This payment has already been confirmed and cannot be modified.', 409, {
      severity: 'low',
      category: 'conflict',
      code: ApiErrorCode.CONFLICT,
    }),

  expired: () =>
    new AppError('This payment intent has expired. Please create a new payment to proceed.', 410, {
      severity: 'low',
      category: 'conflict',
      code: ApiErrorCode.BAD_REQUEST,
    }),

  disputeAlreadyOpen: () =>
    new AppError(
      'A dispute for this payment is already open. Please wait for the existing dispute to be resolved.',
      409,
      { severity: 'low', category: 'conflict', code: ApiErrorCode.CONFLICT }
    ),
};

// ─── Validation Errors ────────────────────────────────────────────────────────

const validation = {
  missingField: (fieldName: string) =>
    new AppError(`"${fieldName}" is required and cannot be empty.`, 400, {
      severity: 'low',
      category: 'validation',
      code: ApiErrorCode.VALIDATION_ERROR,
    }),

  invalidFormat: (fieldName: string, expectedFormat?: string) => {
    const hint = expectedFormat ? ` Expected format: ${expectedFormat}.` : '';
    return new AppError(`"${fieldName}" has an invalid format.${hint}`, 400, {
      severity: 'low',
      category: 'validation',
      code: ApiErrorCode.VALIDATION_ERROR,
    });
  },

  invalidObjectId: (fieldName: string) =>
    new AppError(
      `"${fieldName}" is not a valid ID. IDs must be 24-character hexadecimal strings.`,
      400,
      { severity: 'low', category: 'validation', code: ApiErrorCode.BAD_REQUEST }
    ),

  pageLimitExceeded: (max: number) =>
    new AppError(`Page size cannot exceed ${max}. Please reduce the "limit" parameter.`, 400, {
      severity: 'low',
      category: 'validation',
      code: ApiErrorCode.BAD_REQUEST,
    }),

  invalidCursor: () =>
    new AppError(
      'The pagination cursor is invalid or has expired. Please restart pagination from the first page.',
      400,
      { severity: 'low', category: 'validation', code: ApiErrorCode.BAD_REQUEST }
    ),
};

// ─── Rate Limit Errors ────────────────────────────────────────────────────────

const rateLimit = {
  generic: (retryAfterSeconds?: number) => {
    const hint = retryAfterSeconds
      ? ` Please wait ${retryAfterSeconds} second(s) before retrying.`
      : ' Please slow down and try again shortly.';
    return new AppError(`Too many requests.${hint}`, 429, {
      severity: 'medium',
      category: 'rate_limit',
      code: ApiErrorCode.RATE_LIMITED,
    });
  },

  auth: () =>
    new AppError(
      'Too many login attempts. Please wait 15 minutes before trying again. If you have forgotten your password, use the "Forgot password" link.',
      429,
      { severity: 'medium', category: 'rate_limit', code: ApiErrorCode.RATE_LIMITED }
    ),

  export: () =>
    new AppError(
      'Export limit reached. You can perform up to 5 bulk exports per hour. Please try again later.',
      429,
      { severity: 'low', category: 'rate_limit', code: ApiErrorCode.RATE_LIMITED }
    ),
};

// ─── Subscription Errors ──────────────────────────────────────────────────────

const subscription = {
  limitReached: (resource: string, limit: number, tier: string) =>
    new AppError(
      `Your ${tier} plan allows a maximum of ${limit} ${resource}. Please upgrade your subscription to add more.`,
      403,
      { severity: 'low', category: 'authorization', code: ApiErrorCode.FORBIDDEN }
    ),

  featureNotAvailable: (feature: string, minimumTier: string) =>
    new AppError(
      `"${feature}" is not available on your current plan. Please upgrade to the ${minimumTier} plan or higher to access this feature.`,
      403,
      { severity: 'low', category: 'authorization', code: ApiErrorCode.FORBIDDEN }
    ),
};

// ─── External Service Errors ──────────────────────────────────────────────────

const external = {
  stellarUnavailable: () =>
    new AppError(
      'The Stellar payment network is temporarily unavailable. Please try again in a few minutes. If the issue persists, contact support.',
      502,
      { severity: 'high', category: 'external', code: ApiErrorCode.INTERNAL_SERVER_ERROR }
    ),

  aiServiceUnavailable: () =>
    new AppError(
      'The AI assistant is temporarily unavailable. Your action has been saved without the AI summary. Please try regenerating the summary later.',
      503,
      { severity: 'medium', category: 'external', code: ApiErrorCode.INTERNAL_SERVER_ERROR }
    ),
};

// ─── Generic Errors ───────────────────────────────────────────────────────────

const generic = {
  notFound: (resource: string) =>
    new AppError(
      `${resource} was not found. Please check the ID and ensure you have access to this resource.`,
      404,
      { severity: 'low', category: 'not_found', code: ApiErrorCode.NOT_FOUND }
    ),

  conflict: (detail: string) =>
    new AppError(detail, 409, {
      severity: 'low',
      category: 'conflict',
      code: ApiErrorCode.CONFLICT,
    }),

  internalError: (context?: Record<string, unknown>) =>
    AppError.internal(
      'An unexpected error occurred. Our team has been notified. Please try again or contact support if the problem persists.',
      context
    ),
};

// ─── Barrel export ────────────────────────────────────────────────────────────

/**
 * Namespaced error factories.
 *
 * @example
 *   import { Errors } from '@api/utils/errors';
 *
 *   // Auth
 *   throw Errors.auth.invalidCredentials();
 *   throw Errors.auth.accountLocked(30);
 *
 *   // Patients
 *   throw Errors.patient.notFound(patientId);
 *
 *   // Payments
 *   throw Errors.payment.insufficientBalance('10.5', '3.2');
 *
 *   // Validation
 *   throw Errors.validation.pageLimitExceeded(100);
 */
export const Errors = {
  auth,
  patient,
  encounter,
  payment,
  validation,
  rateLimit,
  subscription,
  external,
  generic,
} as const;
