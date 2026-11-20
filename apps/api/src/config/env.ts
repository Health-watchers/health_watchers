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
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
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

function keyFormatMessage(name: string): string {
  return (
    `${name} must be a 64-char hex string (32 bytes / AES-256) ` +
    `or a base64-encoded 32-byte key`
  );
}

const envSchema = z
  .object({
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
      .refine(isValidAes256Key, keyFormatMessage('FIELD_ENCRYPTION_KEY'))
      .optional(),

    FIELD_ENCRYPTION_KEY_VERSION: z.string().optional(),

    // ── HIPAA — Audit log encryption at rest (§ 164.312(b)) ───────────────────
    // 64-char hex = 32-byte AES-256 key.
    AUDIT_ENCRYPTION_KEY: z
      .string()
      .refine(isValidAes256Key, keyFormatMessage('AUDIT_ENCRYPTION_KEY'))
      .optional(),

    // ── HIPAA — Backup encryption (§ 164.312(c)(1)) ───────────────────────────
    BACKUP_ENCRYPTION_KEY: z
      .string()
      .refine(isValidAes256Key, keyFormatMessage('BACKUP_ENCRYPTION_KEY'))
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

    // ── Idempotency keys for payment endpoints ────────────────────────────────
    // TTL (in seconds) for idempotency key → response mappings. Default: 24 hours.
    IDEMPOTENCY_TTL_SECONDS: z
      .string()
      .regex(/^\d+$/, 'IDEMPOTENCY_TTL_SECONDS must be a positive integer')
      .refine((v) => Number(v) > 0, 'IDEMPOTENCY_TTL_SECONDS must be greater than 0')
      .default('86400'),
  })
  .superRefine((data, ctx) => {
    // HIPAA § 164.312 — In production all PHI encryption keys are mandatory.
    // Running a regulated system with encryption quietly disabled is a
    // compliance failure, so we hard-fail here rather than warn.
    if (data.NODE_ENV !== 'production') return;

    const requiredKeys: Array<{
      name: 'FIELD_ENCRYPTION_KEY' | 'AUDIT_ENCRYPTION_KEY' | 'BACKUP_ENCRYPTION_KEY';
      value: string | undefined;
      section: string;
    }> = [
      {
        name: 'FIELD_ENCRYPTION_KEY',
        value: data.FIELD_ENCRYPTION_KEY,
        section: '§ 164.312(a)(2)(iv)',
      },
      {
        name: 'AUDIT_ENCRYPTION_KEY',
        value: data.AUDIT_ENCRYPTION_KEY,
        section: '§ 164.312(b)',
      },
      {
        name: 'BACKUP_ENCRYPTION_KEY',
        value: data.BACKUP_ENCRYPTION_KEY,
        section: '§ 164.312(c)(1)',
      },
    ];

    for (const { name, value, section } of requiredKeys) {
      if (!value) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [name],
          message:
            `HIPAA VIOLATION (${section}): ${name} is required in production. ` +
            `Set a 64-char hex AES-256 key or base64-encoded 32-byte key.`,
        });
        continue;
      }
      if (!isValidAes256Key(value)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [name],
          message: `HIPAA VIOLATION: ${keyFormatMessage(name)}`,
        });
      }
    }
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

// ── Encryption key readiness / canary ─────────────────────────────────────────
// A key can be present and well-formed yet still unusable (e.g. wrong encoding
// assumptions). Encrypting and decrypting a known canary value proves the key
// actually works before we accept traffic.

const CANARY_PLAINTEXT = 'hipaa-encryption-canary-v1';

function decodeKey(raw: string): Buffer {
  if (HEX_32_BYTES.test(raw)) {
    return Buffer.from(raw, 'hex');
  }
  return Buffer.from(raw, 'base64');
}

/**
 * Verify that the given AES-256 key can encrypt and decrypt a known canary
 * value. Returns true when the round-trip succeeds, false otherwise.
 */
export function verifyEncryptionKeyCanary(rawKey: string | undefined): boolean {
  if (!rawKey || !isValidAes256Key(rawKey)) return false;
  try {
    const key = decodeKey(rawKey);
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    const encrypted = Buffer.concat([
      cipher.update(CANARY_PLAINTEXT, 'utf8'),
      cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();

    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([
      decipher.update(encrypted),
      decipher.final(),
    ]).toString('utf8');

    return decrypted === CANARY_PLAINTEXT;
  } catch {
    return false;
  }
}

export interface EncryptionReadiness {
  fieldEncryption: boolean;
  auditEncryption: boolean;
  backupEncryption: boolean;
  ready: boolean;
}

/**
 * Readiness check for PHI encryption keys. Verifies each configured key can
 * decrypt a known canary value. In production all three must be ready.
 */
export function checkEncryptionReadiness(): EncryptionReadiness {
  const fieldEncryption = verifyEncryptionKeyCanary(env.FIELD_ENCRYPTION_KEY);
  const auditEncryption = verifyEncryptionKeyCanary(env.AUDIT_ENCRYPTION_KEY);
  const backupEncryption = verifyEncryptionKeyCanary(env.BACKUP_ENCRYPTION_KEY);

  const ready = isProd
    ? fieldEncryption && auditEncryption && backupEncryption
    : true;

  return { fieldEncryption, auditEncryption, backupEncryption, ready };
}

// ── Startup config summary ────────────────────────────────────────────────────
/**
 * Log a redacted summary of the validated configuration. Must be called from
 * startServer() (not at import time) so the structured logger is initialised.
 * Secret values are never logged — only whether they are set.
 */
export function logConfigSummary(): void {
  logger.info(
    {
      API_PORT: env.API_PORT,
      MONGO_URI: redactConnectionString(env.MONGO_URI),
      STELLAR_NETWORK: env.STELLAR_NETWORK,
      LOG_LEVEL: env.LOG_LEVEL,
      HIPAA_FIELD_ENCRYPTION_KEY: env.FIELD_ENCRYPTION_KEY ? 'set' : 'NOT SET',
      HIPAA_AUDIT_ENCRYPTION_KEY: env.AUDIT_ENCRYPTION_KEY ? 'set' : 'NOT SET',
      HIPAA_BACKUP_ENCRYPTION_KEY: env.BACKUP_ENCRYPTION_KEY ? 'set' : 'NOT SET',
      HIPAA_SMTP_HOST: env.SMTP_HOST ? 'set' : 'NOT SET',
      TRANSCRIPTION_PROVIDER: env.TRANSCRIPTION_PROVIDER ?? 'NOT SET',
      TRANSCRIPTION_MAX_AUDIO_BYTES: env.TRANSCRIPTION_MAX_AUDIO_BYTES ?? 'default (25 MiB)',
    },
    '✅ Config validated'
  );
}
</｜｜DSML｜｜ parameter>
</invoke>