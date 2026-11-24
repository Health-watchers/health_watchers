/**
 * Validates that all required environment variables are set.
 * Exits with code 1 if any are missing (all envs) or throws in production.
 *
 * Also validates operational configuration values (retry counts, timeouts,
 * batch sizes, rate limit thresholds) at startup so that misconfiguration
 * fails fast with a clear error message.
 */
import { config } from './index';

const REQUIRED_VARS = [
  'MONGO_URI',
  'JWT_ACCESS_TOKEN_SECRET',
  'JWT_REFRESH_TOKEN_SECRET',
  'STELLAR_PLATFORM_PUBLIC_KEY',
  'STELLAR_SECRET_KEY',
  'FIELD_ENCRYPTION_KEY',
  'KEYPAIR_ENCRYPTION_KEY',
] as const;

interface NumericRule {
  /** Dotted path used in error messages, e.g. "retry.maxAttempts". */
  name: string;
  /** Resolved numeric value from config. */
  value: number;
  /** Minimum allowed value (inclusive). */
  min: number;
  /** Maximum allowed value (inclusive). */
  max: number;
  /** Whether the value must be an integer. */
  integer?: boolean;
}

function collectNumericRules(): NumericRule[] {
  return [
    // Retry counts
    { name: 'retry.maxAttempts', value: config.retry.maxAttempts, min: 1, max: 100, integer: true },
    { name: 'retry.baseDelayMs', value: config.retry.baseDelayMs, min: 0, max: 600_000, integer: true },
    { name: 'retry.maxDelayMs', value: config.retry.maxDelayMs, min: 0, max: 3_600_000, integer: true },

    // Timeouts
    { name: 'timeout.requestMs', value: config.timeout.requestMs, min: 1, max: 600_000, integer: true },
    { name: 'timeout.stellarMs', value: config.timeout.stellarMs, min: 1, max: 600_000, integer: true },
    { name: 'timeout.dbMs', value: config.timeout.dbMs, min: 1, max: 600_000, integer: true },

    // Batch sizes
    { name: 'batch.maxSize', value: config.batch.maxSize, min: 1, max: 10_000, integer: true },
    { name: 'batch.chunkSize', value: config.batch.chunkSize, min: 1, max: 10_000, integer: true },

    // Rate limit thresholds
    { name: 'rateLimit.windowMs', value: config.rateLimit.windowMs, min: 1, max: 3_600_000, integer: true },
    { name: 'rateLimit.maxRequests', value: config.rateLimit.maxRequests, min: 1, max: 1_000_000, integer: true },
  ];
}

function validateOperationalConfig(): string[] {
  const errors: string[] = [];

  for (const rule of collectNumericRules()) {
    if (typeof rule.value !== 'number' || Number.isNaN(rule.value)) {
      errors.push(`${rule.name} must be a number (got ${String(rule.value)})`);
      continue;
    }
    if (!Number.isFinite(rule.value)) {
      errors.push(`${rule.name} must be a finite number (got ${rule.value})`);
      continue;
    }
    if (rule.integer && !Number.isInteger(rule.value)) {
      errors.push(`${rule.name} must be an integer (got ${rule.value})`);
    }
    if (rule.value < rule.min || rule.value > rule.max) {
      errors.push(`${rule.name} must be between ${rule.min} and ${rule.max} (got ${rule.value})`);
    }
  }

  // Cross-field consistency checks
  if (
    typeof config.retry.baseDelayMs === 'number' &&
    typeof config.retry.maxDelayMs === 'number' &&
    config.retry.baseDelayMs > config.retry.maxDelayMs
  ) {
    errors.push(
      `retry.baseDelayMs (${config.retry.baseDelayMs}) must not exceed retry.maxDelayMs (${config.retry.maxDelayMs})`,
    );
  }

  if (
    typeof config.batch.chunkSize === 'number' &&
    typeof config.batch.maxSize === 'number' &&
    config.batch.chunkSize > config.batch.maxSize
  ) {
    errors.push(
      `batch.chunkSize (${config.batch.chunkSize}) must not exceed batch.maxSize (${config.batch.maxSize})`,
    );
  }

  return errors;
}

export function validateStartupSecrets(): void {
  const missing = REQUIRED_VARS.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    const msg = `Missing required environment variables: ${missing.join(', ')}`;
    if (process.env.NODE_ENV === 'production') {
      throw new Error(msg);
    }
    console.error(`❌ ${msg}`);
    process.exit(1);
  }

  const configErrors = validateOperationalConfig();
  if (configErrors.length > 0) {
    const msg = `Invalid configuration:\n  - ${configErrors.join('\n  - ')}`;
    if (process.env.NODE_ENV === 'production') {
      throw new Error(msg);
    }
    console.error(`❌ ${msg}`);
    process.exit(1);
  }
}

export function logSecretsStatus(): void {
  for (const key of REQUIRED_VARS) {
    const set = Boolean(process.env[key]);
    console.log(`  ${set ? '✅' : '⚠️  missing'} ${key}`);
  }
}