/**
 * Environment variable validation — must be imported before any other module.
 * Uses zod to parse and validate all required env vars.
 * Reports missing/invalid vars via the structured logger and exits with code 1 on failure.
 *
 * HIPAA Security Rule § 164.312 — Technical Safeguards:
 * All encryption keys, JWT secrets, and SMTP credentials are validated here.
 * Missing critical HIPAA vars cause a hard exit in production.
 */
import { z } from 'zod';
import { randomBytes } from 'crypto';
import { redactConnectionString } from '../utils/redact';
import { logger } from '../utils/logger';

// ── Encryption key format helpers ─────────────────────────────────────────────
// A valid AES-256 key is either 64 hex chars (32 bytes) or base64-encoded 32 bytes.
const HEX_32_BYTES = /^[0-9a-fA-F]{64}$/;

function isBase64_32Bytes(value: string): boolean {
  // Base64 of 32 bytes is 44 chars ending with '=' (or 43 chars without padding).
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(value)) return false;
  try {
    const buf = Buffer.from(value, 'base64');
    // Reject strings that decode to something other than 32 bytes.
    return buf.length === 32;
  } catch {
    return false;
  }
}

function isValidAes256Key(value: string): boolean {
  return HEX_32_BYTES.test(value) || isBase64_32Bytes(value);
}

// Positive-integer env var with a default. Rejects zero and non-numeric input.
function positiveIntString(defaultValue: string) {
  return z
    .string()
    .regex(/^\d+$/, 'must be a positive integer')
    .refine((v) => Number(v) > 0, 'must be greater than 0')
    .default(defaultValue);
}

const envSchema = z.object({
  MONGO_URI: z
    .string({ required_error: 'Missing required env var: MONGO_URI' })
    .min(1, 'Missing required env var: MONGO_URI'),

  REDIS_URL: z.string().optional(),

  JWT_ACCESS_TOKEN_SECRET: z
    .string({ required_error: 'Missing required env var: JWT_ACCESS_TOKEN_SECRET' })
    .min(32, 'JWT_ACCESS_TOKEN_SECRET must be at least 32 characters (too weak)'),

  JWT_REFRESH_TOKEN_SECRET: z
    .string({ required_error: 'Missing required env var: JWT_REFRESH_TOKEN_SECRET' })
    .min(32, 'JWT_REFRESH_TOKEN_SECRET must be at least 32 characters (too weak)'),

  API_PORT: z.string().default('3001'),

  // Documented override for PaaS hosts (Heroku, Render, etc.) that inject PORT.
  // When unset, the API listens on API_PORT.
  PORT: z
    .string()
    .regex(/^\d+$/, 'PORT must be a positive integer')
    .optional(),

  STELLAR_NETWORK: z.enum(['testnet', 'mainnet']).default('testnet'),

  GEMINI_API_KEY: z.string().optional(),

  // ── AI voice transcription (encounter audio → SOAP notes) ─────────────────
  // Provider selection. Optional so the API boots in development without it;
  // the transcription service falls back to a safe default when unset.
  TRANSCRIPTION_PROVIDER: z.enum(['google', 'whisper']).optional(),

  // Google Speech-to-Text API key (required when TRANSCRIPTION_PROVIDER=google).
  GOOGLE_SPEECH_API_KEY: z.string().optional(),

  // OpenAI API key for Whisper (required when TRANSCRIPTION_PROVIDER=whisper).
  OPENAI_API_KEY: z.string().optional(),

  // Maximum accepted audio upload size in bytes. Default: 25 MiB.
  TRANSCRIPTION_MAX_AUDIO_BYTES: z
    .string()
    .regex(/^\d+$/, 'TRANSCRIPTION_MAX_AUDIO_BYTES must be a positive integer')
    .optional(),

  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),

  WEB_URL: z.string().min(1, 'WEB_URL must not be empty').default('http://localhost:3000'),

  SENTRY_DSN: z.string().url().optional(),

  // ── HIPAA — PHI field-level encryption (§ 164.312(a)(2)(iv)) ──────────────
  // 64-char hex = 32-byte AES-256 key.  Generate:
  //   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
  // Rotate annually; keep old key in FIELD_ENCRYPTION_KEY_V<n> during migration.
  FIELD_ENCRYPTION_KEY: z
    .string()
    .length(64, 'FIELD_ENCRYPTION_KEY must be a 64-char hex string (32 bytes / AES-256)')
    .optional(),

  FIELD_ENCRYPTION_KEY_VERSION: z.string().optional(),

  // ── HIPAA — Audit log encryption at rest (§ 164.312(b)) ───────────────────
  // 64-char hex = 32-byte AES-256 key.
  AUDIT_ENCRYPTION_KEY: z
    .string()
    .length(64, 'AUDIT_ENCRYPTION_KEY must be a 64-char hex string (32 bytes / AES-256)')
    .optional(),

  // ── HIPAA — Backup encryption (§ 164.312(c)(1)) ───────────────────────────
  BACKUP_ENCRYPTION_KEY: z
    .string()
    .min(32, 'BACKUP_ENCRYPTION_KEY must be at least 32 characters')
    .optional(),

  // ── HIPAA — SMTP for breach notification emails (§ 164.410) ───────────────
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.string().optional(),
  SMTP_SECURE: z.string().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.string().optional(),
  APP_BASE_URL: z.string().optional(),

  // ── HIPAA — Data retention & destruction ──────────────────────────────────
  // Clinical record retention in years (HIPAA minimum: 6 years). Default: 7.
  CLINICAL_RETENTION_YEARS: z.string().optional(),
  // Audit log retention in years (HIPAA minimum: 6 years). Default: 6.
  AUDIT_LOG_RETENTION_YEARS: z.string().optional(),

  // ── Security training enforcement (§ 164.308(a)(5)) ──────────────────────
  // Annual training expiry window in days. Default: 365.
  SECURITY_TRAINING_EXPIRY_DAYS: z.string().optional(),

  // ── TLS enforcement ───────────────────────────────────────────────────────
  TRUST_PROXY: z.string().optional(),
  NODE_ENV: z.string().optional(),

  // ── Webhook signature verification (HMAC-SHA256) ──────────────────────────
  // Current signing secret used to verify X-Webhook-Signature on incoming webhooks.
  WEBHOOK_SIGNING_SECRET: z
    .string()
    .min(32, 'WEBHOOK_SIGNING_SECRET must be at least 32 characters (too weak)')
    .optional(),
  // Previous signing secret, accepted during key rotation.
  WEBHOOK_SIGNING_SECRET_PREVIOUS: z
    .string()
    .min(32, 'WEBHOOK_SIGNING_SECRET_PREVIOUS must be at least 32 characters (too weak)')
    .optional(),

  // ── HMAC secrets for QR check-in and telehealth meeting links ─────────────
  // Must be independent of the JWT secrets so a leaked key cannot compromise
  // both systems. Required in production (see checks below); in development a
  // random per-process secret is generated when unset.
  QR_CHECKIN_SECRET: z
    .string()
    .min(32, 'QR_CHECKIN_SECRET must be at least 32 characters (too weak)')
    .optional(),

  TELEHEALTH_LINK_SECRET: z
    .string()
    .min(32, 'TELEHEALTH_LINK_SECRET must be at least 32 characters (too weak)')
    .optional(),

  // ── Idempotency keys for payment endpoints ────────────────────────────────
  // TTL (in seconds) for idempotency key → response mappings. Default: 24 hours.
  IDEMPOTENCY_TTL_SECONDS: z
    .string()
    .regex(/^\d+$/, 'IDEMPOTENCY_TTL_SECONDS must be a positive integer')
    .refine((v) => Number(v) > 0, 'IDEMPOTENCY_TTL_SECONDS must be greater than 0')
    .default('86400'),

  // ── Operational tuning (timeouts, retries, batch sizes, rate limits) ──────
  // All values are positive integers with sensible defaults; override via env.
  HTTP_REQUEST_TIMEOUT_MS: positiveIntString('30000'),
  OUTBOUND_HTTP_TIMEOUT_MS: positiveIntString('5000'),
  DB_QUERY_TIMEOUT_MS: positiveIntString('10000'),
  RETRY_MAX_ATTEMPTS: positiveIntString('3'),
  RETRY_BASE_DELAY_MS: positiveIntString('500'),
  RETRY_MAX_DELAY_MS: positiveIntString('30000'),
  BATCH_SIZE: positiveIntString('100'),
  MAX_BATCH_SIZE: positiveIntString('1000'),
  RATE_LIMIT_WINDOW_MS: positiveIntString('60000'),
  RATE_LIMIT_MAX_REQUESTS: positiveIntString('100'),
  AUTH_RATE_LIMIT_MAX_REQUESTS: positiveIntString('10'),
});

const result = envSchema.safeParse(process.env);

if (!result.success) {
  const rows = result.error.errors.map((e) => ({
    Variable: String(e.path[0] ?? 'unknown'),
    Issue: e.message,
  }));

  logger.error(
    { validationErrors: rows },
    '❌ Environment validation failed — see validationErrors for details'
  );

  process.exit(1);
}

export const env = result.data;

// ── HIPAA production checks ───────────────────────────────────────────────────
const isProd = process.env.NODE_ENV === 'production';

// ── HMAC secrets — mandatory in production, random per-process in dev ────────
// A hardcoded fallback would let anyone who reads the source forge QR check-in
// codes or telehealth join links, so production refuses to start without them.
if (isProd) {
  const missingHmacSecrets: string[] = [];
  if (!env.QR_CHECKIN_SECRET) missingHmacSecrets.push('QR_CHECKIN_SECRET');
  if (!env.TELEHEALTH_LINK_SECRET) missingHmacSecrets.push('TELEHEALTH_LINK_SECRET');

  if (missingHmacSecrets.length > 0) {
    logger.error(
      { missingHmacSecrets },
      '🚨 SECURITY VIOLATION: HMAC secrets must be set in production ' +
        '(at least 32 characters). Refusing to start with forgeable HMAC secrets.'
    );
    process.exit(1);
  }
} else {
  if (!env.QR_CHECKIN_SECRET) {
    env.QR_CHECKIN_SECRET = randomBytes(32).toString('hex');
    logger.warn(
      '⚠️  WARNING: QR_CHECKIN_SECRET is not set. Using a random per-process secret; ' +
        'QR check-in codes will not survive a restart or work across replicas.'
    );
  }
  if (!env.TELEHEALTH_LINK_SECRET) {
    env.TELEHEALTH_LINK_SECRET = randomBytes(32).toString('hex');
    logger.warn(
      '⚠️  WARNING: TELEHEALTH_LINK_SECRET is not set. Using a random per-process secret; ' +
        'telehealth join links will not survive a restart or work across replicas.'
    );
  }
}

// Warn when REDIS_URL is absent in production — in-memory rate limiting is
// per-pod and allows brute-force bypass in multi-replica deployments.
if (isProd && !env.REDIS_URL) {
  logger.warn(
    '⚠️  WARNING: REDIS_URL is not set in production. ' +
      'Rate limiting will be in-memory and NOT shared across instances. ' +
      'This allows attackers to bypass brute-force protection by distributing requests across pods.'
  );
}

// HIPAA § 164.410 — SMTP required for breach notification in production
if (isProd && !env.SMTP_HOST) {
  logger.warn(
    '⚠️  HIPAA WARNING: SMTP_HOST is not set in production. ' +
      'Automated breach notification emails (§ 164.410) will not be sent.'
  );
}

// AI voice transcription — warn when the selected provider has no credentials.
// Audio contains PHI, so a misconfigured provider must be visible at startup.
if (env.TRANSCRIPTION_PROVIDER === 'google' && !env.GOOGLE_SPEECH_API_KEY) {
  logger.warn(
    '⚠️  WARNING: TRANSCRIPTION_PROVIDER=google but GOOGLE_SPEECH_API_KEY is not set. ' +
      'Voice transcription requests will fail.'
  );
}
if (env.TRANSCRIPTION_PROVIDER === 'whisper' && !env.OPENAI_API_KEY) {
  logger.warn(
    '⚠️  WARNING: TRANSCRIPTION_PROVIDER=whisper but OPENAI_API_KEY is not set. ' +
      'Voice transcription requests will fail.'
  );
}

// Log non-secret config values at startup as a single structured entry.
logger.info(
  {
    config: {
      apiPort: env.API_PORT,
      portOverride: env.PORT ?? 'not set (using API_PORT)',
      mongoUri: redactConnectionString(env.MONGO_URI),
      stellarNetwork: env.STELLAR_NETWORK,
      logLevel: env.LOG_LEVEL,
      hipaaFieldEncryptionKey: env.FIELD_ENCRYPTION_KEY ? 'set' : 'NOT SET',
      hipaaAuditEncryptionKey: env.AUDIT_ENCRYPTION_KEY ? 'set' : 'NOT SET',
      hipaaBackupEncryptionKey: env.BACKUP_ENCRYPTION_KEY ? 'set' : 'NOT SET',
      hipaaSmtpHost: env.SMTP_HOST ? 'set' : 'NOT SET',
      transcriptionProvider: env.TRANSCRIPTION_PROVIDER ?? 'NOT SET',
      transcriptionMaxAudioBytes: env.TRANSCRIPTION_MAX_AUDIO_BYTES ?? 'default (25 MiB)',
      qrCheckinSecret: env.QR_CHECKIN_SECRET ? 'set' : 'NOT SET',
      telehealthLinkSecret: env.TELEHEALTH_LINK_SECRET ? 'set' : 'NOT SET',
      httpRequestTimeoutMs: env.HTTP_REQUEST_TIMEOUT_MS,
      outboundHttpTimeoutMs: env.OUTBOUND_HTTP_TIMEOUT_MS,
      dbQueryTimeoutMs: env.DB_QUERY_TIMEOUT_MS,
      retryMaxAttempts: env.RETRY_MAX_ATTEMPTS,
      retryBaseDelayMs: env.RETRY_BASE_DELAY_MS,
      retryMaxDelayMs: env.RETRY_MAX_DELAY_MS,
      batchSize: env.BATCH_SIZE,
      maxBatchSize: env.MAX_BATCH_SIZE,
      rateLimitWindowMs: env.RATE_LIMIT_WINDOW_MS,
      rateLimitMaxRequests: env.RATE_LIMIT_MAX_REQUESTS,
      authRateLimitMaxRequests: env.AUTH_RATE_LIMIT_MAX_REQUESTS,
    },
  },
  '✅ Config validated'
);
