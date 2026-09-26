/**
 * Environment variable validation — must be imported before any other module.
 * Uses zod to parse and validate all required env vars.
 * Prints a table of missing/invalid vars and exits with code 1 on failure.
 *
 * HIPAA Security Rule § 164.312 — Technical Safeguards:
 * All encryption keys, JWT secrets, and SMTP credentials are validated here.
 * Missing critical HIPAA vars cause a hard exit in production.
 */
import { z } from 'zod';
import { redactConnectionString } from '../utils/redact';

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

  STELLAR_NETWORK: z.enum(['testnet', 'mainnet']).default('testnet'),

  GEMINI_API_KEY: z.string().optional(),

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
});

const result = envSchema.safeParse(process.env);

if (!result.success) {
  console.error('\n❌ Environment validation failed:\n');

  const rows = result.error.errors.map((e) => ({
    Variable: String(e.path[0] ?? 'unknown'),
    Issue: e.message,
  }));

  // Print a simple table
  const varWidth = Math.max(8, ...rows.map((r) => r.Variable.length));
  const issueWidth = Math.max(5, ...rows.map((r) => r.Issue.length));
  const divider = `+-${'-'.repeat(varWidth)}-+-${'-'.repeat(issueWidth)}-+`;

  console.error(divider);
  console.error(`| ${'Variable'.padEnd(varWidth)} | ${'Issue'.padEnd(issueWidth)} |`);
  console.error(divider);
  for (const row of rows) {
    console.error(`| ${row.Variable.padEnd(varWidth)} | ${row.Issue.padEnd(issueWidth)} |`);
  }
  console.error(divider);
  console.error('');

  process.exit(1);
}

export const env = result.data;

// ── HIPAA production checks ───────────────────────────────────────────────────
const isProd = process.env.NODE_ENV === 'production';

// Warn when REDIS_URL is absent in production — in-memory rate limiting is
// per-pod and allows brute-force bypass in multi-replica deployments.
if (isProd && !env.REDIS_URL) {
  console.warn(
    '⚠️  WARNING: REDIS_URL is not set in production. ' +
      'Rate limiting will be in-memory and NOT shared across instances. ' +
      'This allows attackers to bypass brute-force protection by distributing requests across pods.'
  );
}

// HIPAA § 164.312(a)(2)(iv) — PHI encryption key required in production
if (isProd && !env.FIELD_ENCRYPTION_KEY) {
  console.error(
    '🚨 HIPAA VIOLATION: FIELD_ENCRYPTION_KEY is not set in production. ' +
      'PHI will be stored in plaintext. Set a 64-char hex AES-256 key immediately.'
  );
  process.exit(1);
}

// HIPAA § 164.312(b) — Audit log encryption required in production
if (isProd && !env.AUDIT_ENCRYPTION_KEY) {
  console.warn(
    '⚠️  HIPAA WARNING: AUDIT_ENCRYPTION_KEY is not set in production. ' +
      'Audit log metadata will not be encrypted at rest. ' +
      'Set a 64-char hex AES-256 key for full § 164.312(b) compliance.'
  );
}

// HIPAA § 164.312(c)(1) — Backup encryption required in production
if (isProd && !env.BACKUP_ENCRYPTION_KEY) {
  console.warn(
    '⚠️  HIPAA WARNING: BACKUP_ENCRYPTION_KEY is not set in production. ' +
      'Database backups will not be encrypted. Set a strong passphrase.'
  );
}

// HIPAA § 164.410 — SMTP required for breach notification in production
if (isProd && !env.SMTP_HOST) {
  console.warn(
    '⚠️  HIPAA WARNING: SMTP_HOST is not set in production. ' +
      'Automated breach notification emails (§ 164.410) will not be sent.'
  );
}

// Log non-secret config values at startup
console.log('✅ Config validated:');
console.log(`   API_PORT:        ${env.API_PORT}`);
console.log(`   MONGO_URI:       ${redactConnectionString(env.MONGO_URI)}`);
console.log(`   STELLAR_NETWORK: ${env.STELLAR_NETWORK}`);
console.log(`   LOG_LEVEL:       ${env.LOG_LEVEL}`);
console.log(`   HIPAA FIELD_ENCRYPTION_KEY: ${env.FIELD_ENCRYPTION_KEY ? '✅ set' : '⚠️  NOT SET'}`);
console.log(`   HIPAA AUDIT_ENCRYPTION_KEY: ${env.AUDIT_ENCRYPTION_KEY ? '✅ set' : '⚠️  NOT SET'}`);
console.log(`   HIPAA BACKUP_ENCRYPTION_KEY: ${env.BACKUP_ENCRYPTION_KEY ? '✅ set' : '⚠️  NOT SET'}`);
console.log(`   HIPAA SMTP_HOST:             ${env.SMTP_HOST ? '✅ set' : '⚠️  NOT SET'}`);
