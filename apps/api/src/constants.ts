/**
 * @module constants
 * @description Shared application constants — single source of truth.
 *
 * Issue #1063 — Create Shared Constants
 *
 * All magic strings, magic numbers, and repeated literals that appear in
 * more than one module belong here.  Import the relevant group from this
 * file instead of hard-coding values inline.
 *
 * Organisation:
 *   - HTTP / Pagination
 *   - Cache TTLs
 *   - Rate-limit windows & quotas
 *   - Authentication / JWT
 *   - Patient / Clinical
 *   - Subscription tiers
 *   - Stellar / Payments
 *   - Database / MongoDB
 *   - Export / File
 *   - Roles & Permissions
 *   - Audit actions
 *   - Job schedules
 */

// ─── HTTP / Pagination ────────────────────────────────────────────────────────

/** Default number of items returned in a paginated list. */
export const DEFAULT_PAGE_SIZE = 20;

/** Absolute maximum items a single paginated request may return. */
export const MAX_PAGE_SIZE = 100;

/** Default sort direction for list endpoints (newest first). */
export const DEFAULT_SORT_ORDER = -1 as const;

// ─── Cache TTLs (seconds) ──────────────────────────────────────────────────────

export const CACHE_TTL = {
  /** Short-lived results that change frequently (e.g. dashboard stats). */
  SHORT: 60,
  /** Standard query results (e.g. patient lists, encounter summaries). */
  DEFAULT: 300,
  /** Rarely-changing reference data (e.g. ICD-10 codes, CPT codes). */
  LONG: 3_600,
  /** Nearly static data (e.g. subscription tier configs). */
  VERY_LONG: 86_400,
  /** Token denylist entry — set to match the token's remaining lifetime. */
  TOKEN_DENYLIST: 900,
  /** Per-user logout-all invalidation guard (7 days = max refresh token life). */
  USER_INVALIDATION: 7 * 24 * 60 * 60,
} as const;

// ─── Rate-limit Windows & Quotas ──────────────────────────────────────────────

export const RATE_LIMIT = {
  /** Auth endpoints: max requests per window. */
  AUTH_MAX: 5,
  AUTH_WINDOW_MS: 15 * 60 * 1_000,

  /** Forgot-password: max requests per window. */
  FORGOT_PASSWORD_MAX: 3,
  FORGOT_PASSWORD_WINDOW_MS: 60 * 60 * 1_000,

  /** General API: max requests per window. */
  GENERAL_MAX: 300,
  GENERAL_WINDOW_MS: 15 * 60 * 1_000,

  /** AI endpoints: max requests per window per clinic. */
  AI_MAX: 20,
  AI_WINDOW_MS: 60 * 1_000,

  /** Payment intent: max requests per window per clinic. */
  PAYMENT_MAX: 20,
  PAYMENT_WINDOW_MS: 60 * 1_000,

  /** Bulk export: max requests per window per user. */
  BULK_EXPORT_MAX: 5,
  BULK_EXPORT_WINDOW_MS: 60 * 60 * 1_000,

  /** Patient search: max requests per window per user. */
  PATIENT_SEARCH_MAX: 100,
  PATIENT_SEARCH_WINDOW_MS: 60 * 1_000,

  /** Report generation: max requests per window per user. */
  REPORT_GENERATION_MAX: 10,
  REPORT_GENERATION_WINDOW_MS: 60 * 60 * 1_000,
} as const;

// ─── Authentication / JWT ─────────────────────────────────────────────────────

export const AUTH = {
  /** Access token lifetime in seconds (15 minutes). */
  ACCESS_TOKEN_TTL_SECONDS: 15 * 60,

  /** Refresh token lifetime in seconds (7 days). */
  REFRESH_TOKEN_TTL_SECONDS: 7 * 24 * 60 * 60,

  /** Maximum consecutive failed login attempts before account lockout. */
  MAX_FAILED_LOGIN_ATTEMPTS: 5,

  /** Account lockout duration in milliseconds (30 minutes). */
  LOCKOUT_DURATION_MS: 30 * 60 * 1_000,

  /** Password reset token lifetime in milliseconds (1 hour). */
  PASSWORD_RESET_TTL_MS: 60 * 60 * 1_000,

  /** MFA grace period for new accounts (days). */
  MFA_GRACE_PERIOD_DAYS: 7,

  /** Minimum password length (characters). */
  PASSWORD_MIN_LENGTH: 8,

  /** TOTP window (±1 step = 30 s tolerance). */
  TOTP_WINDOW: 1,

  /** Number of TOTP backup codes issued per user. */
  BACKUP_CODE_COUNT: 10,
} as const;

// ─── Patient / Clinical ───────────────────────────────────────────────────────

export const PATIENT = {
  /** Maximum number of allergies stored per patient. */
  MAX_ALLERGIES: 50,

  /** Maximum number of emergency contacts per patient. */
  MAX_EMERGENCY_CONTACTS: 5,

  /** Maximum number of insurance entries per patient. */
  MAX_INSURANCE_ENTRIES: 5,

  /** Risk score lower bound. */
  RISK_SCORE_MIN: 0,

  /** Risk score upper bound. */
  RISK_SCORE_MAX: 100,

  /** Risk level thresholds. */
  RISK_THRESHOLD: {
    LOW: 25,
    MEDIUM: 50,
    HIGH: 75,
  },

  /** Trend change threshold — movements < 3 % are classified as "stable". */
  TREND_THRESHOLD_PERCENT: 3,
} as const;

export const ENCOUNTER = {
  /** Maximum prescriptions allowed per encounter. */
  MAX_PRESCRIPTIONS: 20,

  /** Maximum diagnosis codes per encounter. */
  MAX_DIAGNOSES: 10,

  /** Summary email sent if AI is available within this many minutes of sign-off. */
  SUMMARY_EMAIL_DELAY_MINUTES: 5,
} as const;

// ─── Subscription Tiers ───────────────────────────────────────────────────────

/**
 * Subscription tier identifiers.
 * Mirror `SubscriptionTier` from `modules/subscriptions/subscription.tiers.ts`.
 */
export const SUBSCRIPTION_TIER = {
  FREE: 'free',
  BASIC: 'basic',
  PREMIUM: 'premium',
} as const;

// ─── Stellar / Payments ───────────────────────────────────────────────────────

export const STELLAR = {
  /** Base reserve per account on the Stellar network (XLM). */
  BASE_RESERVE_XLM: 1,

  /** Minimum balance required to send a payment (XLM). */
  MINIMUM_ACCOUNT_BALANCE_XLM: 2,

  /** Default payment memo prefix. */
  MEMO_PREFIX: 'HW-',

  /** Maximum memo length for a Stellar transaction. */
  MEMO_MAX_LENGTH: 28,

  /** XLM rate cache TTL in seconds (5 minutes). */
  RATE_CACHE_TTL_SECONDS: 300,

  /** Stale XLM rate threshold — alert if older than this many seconds. */
  RATE_STALE_THRESHOLD_SECONDS: 900,
} as const;

export const PAYMENT = {
  /** Default payment intent expiry (minutes). */
  INTENT_EXPIRY_MINUTES: 30,

  /** Maximum batch size for batch-payment operations. */
  BATCH_MAX_SIZE: 50,

  /** Maximum dispute description length (characters). */
  DISPUTE_DESCRIPTION_MAX_LENGTH: 1_000,
} as const;

// ─── Database / MongoDB ───────────────────────────────────────────────────────

export const DB = {
  /** Default connection pool size. */
  DEFAULT_POOL_SIZE: 10,

  /** Minimum pool size. */
  MIN_POOL_SIZE: 2,

  /** Pool utilisation fraction that triggers a warning log. */
  POOL_WARN_THRESHOLD: 0.8,

  /** Max exponential-backoff retries for initial connection. */
  CONNECT_MAX_RETRIES: 5,

  /** Initial retry delay in milliseconds. */
  CONNECT_BASE_DELAY_MS: 1_000,

  /** System-profile slow-query threshold in milliseconds. */
  SLOW_QUERY_THRESHOLD_MS: 100,
} as const;

// ─── Export / File ────────────────────────────────────────────────────────────

export const EXPORT = {
  /** Maximum rows per streaming CSV chunk. */
  CHUNK_SIZE: 500,

  /** Maximum records in a single bulk export. */
  MAX_RECORDS: 10_000,

  /** Supported export formats. */
  FORMAT: {
    CSV: 'csv',
    PDF: 'pdf',
    FHIR: 'fhir',
    HL7: 'hl7',
  },

  /** Signed URL expiry for download links (seconds). */
  DOWNLOAD_URL_TTL_SECONDS: 3_600,
} as const;

// ─── Roles & Permissions ──────────────────────────────────────────────────────

/**
 * All valid user roles in the system.
 * Keep in sync with the `role` enum in `modules/auth/models/user.model.ts`.
 */
export const ROLE = {
  SUPER_ADMIN: 'SUPER_ADMIN',
  CLINIC_ADMIN: 'CLINIC_ADMIN',
  DOCTOR: 'DOCTOR',
  NURSE: 'NURSE',
  RECEPTIONIST: 'RECEPTIONIST',
  PATIENT: 'PATIENT',
} as const;

export type UserRole = (typeof ROLE)[keyof typeof ROLE];

/** Roles that may write clinical records (encounters, patients, etc.). */
export const WRITE_ROLES: UserRole[] = [ROLE.DOCTOR, ROLE.CLINIC_ADMIN, ROLE.SUPER_ADMIN];

/** Roles that require staff-level access. */
export const STAFF_ROLES: UserRole[] = [
  ROLE.DOCTOR,
  ROLE.CLINIC_ADMIN,
  ROLE.SUPER_ADMIN,
  ROLE.NURSE,
];

/** Roles with administrative access. */
export const ADMIN_ROLES: UserRole[] = [ROLE.CLINIC_ADMIN, ROLE.SUPER_ADMIN];

// ─── Audit Actions ────────────────────────────────────────────────────────────

/**
 * Audit log action identifiers — consistent strings used across all modules.
 * Using constants prevents typos in action names that would break audit reports.
 */
export const AUDIT_ACTION = {
  // Auth
  USER_LOGIN: 'user.login',
  USER_LOGOUT: 'user.logout',
  USER_LOGOUT_ALL: 'user.logout_all',
  USER_PASSWORD_CHANGED: 'user.password_changed',
  USER_PASSWORD_RESET: 'user.password_reset',
  USER_MFA_ENABLED: 'user.mfa_enabled',
  USER_MFA_DISABLED: 'user.mfa_disabled',
  USER_ACCOUNT_LOCKED: 'user.account_locked',
  USER_ACCOUNT_UNLOCKED: 'user.account_unlocked',

  // Patients
  PATIENT_CREATED: 'patient.created',
  PATIENT_UPDATED: 'patient.updated',
  PATIENT_DELETED: 'patient.deleted',
  PATIENT_VIEWED: 'patient.viewed',
  PATIENT_MERGED: 'patient.merged',
  PATIENT_EXPORTED: 'patient.exported',

  // Encounters
  ENCOUNTER_CREATED: 'encounter.created',
  ENCOUNTER_UPDATED: 'encounter.updated',
  ENCOUNTER_SIGNED_OFF: 'encounter.signed_off',
  ENCOUNTER_EXPORTED: 'encounter.exported',

  // Payments
  PAYMENT_INITIATED: 'payment.initiated',
  PAYMENT_CONFIRMED: 'payment.confirmed',
  PAYMENT_FAILED: 'payment.failed',
  PAYMENT_DISPUTE_OPENED: 'payment.dispute_opened',
  PAYMENT_DISPUTE_RESOLVED: 'payment.dispute_resolved',
  PAYMENT_REFUND_ISSUED: 'payment.refund_issued',

  // Invoices
  INVOICE_CREATED: 'invoice.created',
  INVOICE_UPDATED: 'invoice.updated',

  // Documents
  DOCUMENT_UPLOADED: 'document.uploaded',
  DOCUMENT_DOWNLOADED: 'document.downloaded',
  DOCUMENT_DELETED: 'document.deleted',

  // Clinic
  CLINIC_SETTINGS_UPDATED: 'clinic.settings_updated',
  CLINIC_KEYPAIR_ROTATED: 'clinic.keypair_rotated',

  // API keys
  API_KEY_CREATED: 'api_key.created',
  API_KEY_REVOKED: 'api_key.revoked',
} as const;

export type AuditAction = (typeof AUDIT_ACTION)[keyof typeof AUDIT_ACTION];

// ─── Job Schedules (cron expressions) ─────────────────────────────────────────

export const CRON = {
  /** Every minute. */
  EVERY_MINUTE: '* * * * *',
  /** Every 5 minutes. */
  EVERY_5_MINUTES: '*/5 * * * *',
  /** Every 15 minutes. */
  EVERY_15_MINUTES: '*/15 * * * *',
  /** Every hour at :00. */
  HOURLY: '0 * * * *',
  /** Every day at midnight UTC. */
  DAILY_MIDNIGHT: '0 0 * * *',
  /** Every day at 02:00 UTC (low-traffic window). */
  DAILY_2AM: '0 2 * * *',
  /** Every Sunday at 03:00 UTC (weekly maintenance window). */
  WEEKLY_SUNDAY_3AM: '0 3 * * 0',
} as const;
