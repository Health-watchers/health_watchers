import dotenv from 'dotenv';
import path from 'path';
import { validateStartupSecrets, logSecretsStatus } from './secrets-validator';

if (process.env.NODE_ENV !== 'production') {
  dotenv.config({ path: path.resolve(__dirname, '../../.env') });
}

validateStartupSecrets();

const network = process.env.STELLAR_NETWORK || 'testnet';
const horizonUrl =
  network === 'mainnet' ? 'https://horizon.stellar.org' : 'https://horizon-testnet.stellar.org';

const stellarServiceUrl = process.env.STELLAR_SERVICE_URL || 'http://localhost:3002';

/**
 * Parse an integer environment variable, falling back to `fallback` when the
 * variable is unset or empty. Throws when the value is present but not a valid
 * integer so misconfiguration fails fast at startup.
 */
function intFromEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === '') return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed)) {
    throw new Error(`Invalid configuration: ${name} must be an integer, got "${raw}"`);
  }
  return parsed;
}

/** Parse a positive integer env var (>= 1). */
function positiveIntFromEnv(name: string, fallback: number): number {
  const value = intFromEnv(name, fallback);
  if (value < 1) {
    throw new Error(`Invalid configuration: ${name} must be >= 1, got ${value}`);
  }
  return value;
}

/** Parse a non-negative integer env var (>= 0). */
function nonNegativeIntFromEnv(name: string, fallback: number): number {
  const value = intFromEnv(name, fallback);
  if (value < 0) {
    throw new Error(`Invalid configuration: ${name} must be >= 0, got ${value}`);
  }
  return value;
}

function hostnameOf(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

// Issue #1668: allowlist of permitted outbound hostnames for *fixed* outbound
// targets (Stellar Horizon, exchange-rate APIs, stellar-service). This is NOT
// applied to user-registered webhooks — those are protected by the SSRF
// blocklist in apps/api/src/utils/url-validator.ts.
const configuredAllowedHosts = (process.env.OUTBOUND_ALLOWED_HOSTS || '')
  .split(',')
  .map((h) => h.trim().toLowerCase())
  .filter(Boolean);

const defaultAllowedHosts = [hostnameOf(horizonUrl), hostnameOf(stellarServiceUrl)].filter(
  (h): h is string => Boolean(h)
);

export const config = {
  // Server Configuration
  apiPort: process.env.API_PORT || '3001',
  nodeEnv: process.env.NODE_ENV || 'development',

  // Database Configuration
  mongoUri: process.env.MONGO_URI || '',
  mongoMaxPool: parseInt(process.env.MONGO_MAX_POOL_SIZE || '10', 10),

  // JWT Authentication
  jwt: {
    accessTokenSecret: process.env.JWT_ACCESS_TOKEN_SECRET || '',
    refreshTokenSecret: process.env.JWT_REFRESH_TOKEN_SECRET || '',
    tempTokenSecret: process.env.JWT_TEMP_TOKEN_SECRET || '',
    issuer: process.env.JWT_ISSUER || 'health-watchers-api',
    audience: process.env.JWT_AUDIENCE || 'health-watchers-client',
  },

  // Blockchain Configuration (flat aliases kept for backward compat)
  stellarNetwork: network,
  stellarHorizonUrl: horizonUrl,
  stellarSecretKey: process.env.STELLAR_SECRET_KEY || '',
  stellar: {
    network,
    horizonUrl,
    secretKey: process.env.STELLAR_SECRET_KEY || '',
    platformPublicKey: process.env.STELLAR_PLATFORM_PUBLIC_KEY || '',
    usdcIssuer:
      network === 'mainnet'
        ? 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN'
        : 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5',
  },

  // Payment Assets
  // Comma-separated list of supported asset codes. XLM (native) is always included.
  // Format: "XLM,USDC,EURC"
  supportedAssets: (process.env.SUPPORTED_ASSETS || 'XLM')
    .split(',')
    .map((a) => a.trim().toUpperCase())
    .filter(Boolean),

  // Stellar Service (microservice for blockchain operations)
  stellarServiceUrl,

  // Outbound HTTP SSRF protection (issue #1668)
  outbound: {
    // Hostnames permitted for fixed outbound targets. Defaults include the
    // configured Horizon and stellar-service hosts so Stellar calls work
    // out of the box.
    allowedHosts: Array.from(new Set([...defaultAllowedHosts, ...configuredAllowedHosts])),
    // When true, fixed outbound targets must match the allowlist.
    enforceAllowlist: process.env.OUTBOUND_ENFORCE_ALLOWLIST === 'true',
  },

  // AI/LLM Configuration
  geminiApiKey: process.env.GEMINI_API_KEY || '',

  // PHI Field-Level Encryption
  fieldEncryptionKey: process.env.FIELD_ENCRYPTION_KEY || '',

  // Stellar Keypair Encryption (separate key from PHI encryption)
  keypairEncryptionKey: process.env.KEYPAIR_ENCRYPTION_KEY || '',

  // Email Configuration
  email: {
    provider: (process.env.EMAIL_PROVIDER || 'smtp') as 'smtp' | 'sendgrid',
    from: process.env.EMAIL_FROM || 'noreply@healthwatchers.com',
    smtp: {
      host: process.env.SMTP_HOST || 'localhost',
      port: Number(process.env.SMTP_PORT) || 587,
      secure: process.env.SMTP_SECURE === 'true',
      user: process.env.SMTP_USER || '',
      pass: process.env.SMTP_PASS || '',
    },
    sendgridApiKey: process.env.SENDGRID_API_KEY || '',
  },

  // Web frontend URL (used for Socket.IO CORS)
  webUrl: process.env.WEB_URL || 'http://localhost:3000',

  // Redis (used by BullMQ)
  redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',

  // Timeouts (milliseconds). Issue #1680: previously hardcoded in controllers
  // and services; now configurable via environment variables.
  timeouts: {
    // Generic outbound HTTP request timeout.
    httpRequestMs: positiveIntFromEnv('HTTP_REQUEST_TIMEOUT_MS', 30000),
    // Stellar Horizon / stellar-service call timeout.
    stellarRequestMs: positiveIntFromEnv('STELLAR_REQUEST_TIMEOUT_MS', 30000),
    // Webhook delivery timeout.
    webhookDeliveryMs: positiveIntFromEnv('WEBHOOK_DELIVERY_TIMEOUT_MS', 5000),
    // Exchange-rate API call timeout.
    exchangeRateMs: positiveIntFromEnv('EXCHANGE_RATE_TIMEOUT_MS', 5000),
    // Database query timeout.
    dbQueryMs: positiveIntFromEnv('DB_QUERY_TIMEOUT_MS', 30000),
    // Socket.IO / long-poll connection idle timeout.
    socketIdleMs: positiveIntFromEnv('SOCKET_IDLE_TIMEOUT_MS', 60000),
  },

  // Retry policy. Issue #1680.
  retries: {
    // Number of retry attempts for outbound HTTP requests.
    httpMaxAttempts: nonNegativeIntFromEnv('HTTP_RETRY_MAX_ATTEMPTS', 3),
    // Base delay for exponential backoff (ms).
    httpBaseDelayMs: positiveIntFromEnv('HTTP_RETRY_BASE_DELAY_MS', 500),
    // Number of retry attempts for webhook deliveries.
    webhookMaxAttempts: nonNegativeIntFromEnv('WEBHOOK_RETRY_MAX_ATTEMPTS', 5),
    // Base delay for webhook exponential backoff (ms).
    webhookBaseDelayMs: positiveIntFromEnv('WEBHOOK_RETRY_BASE_DELAY_MS', 1000),
    // Number of retry attempts for Stellar submissions.
    stellarMaxAttempts: nonNegativeIntFromEnv('STELLAR_RETRY_MAX_ATTEMPTS', 3),
    // Base delay for Stellar exponential backoff (ms).
    stellarBaseDelayMs: positiveIntFromEnv('STELLAR_RETRY_BASE_DELAY_MS', 1000),
  },

  // Batch sizes. Issue #1680.
  batch: {
    // Max records processed per batch job (e.g. reconciliation, exports).
    size: positiveIntFromEnv('BATCH_SIZE', 100),
    // Max records per database bulk insert/update.
    dbChunkSize: positiveIntFromEnv('DB_BATCH_CHUNK_SIZE', 500),
    // Max webhook deliveries processed concurrently.
    webhookConcurrency: positiveIntFromEnv('WEBHOOK_BATCH_CONCURRENCY', 10),
    // Max items returned per paginated API response.
    maxPageSize: positiveIntFromEnv('MAX_PAGE_SIZE', 100),
    // Default page size when the client does not specify one.
    defaultPageSize: positiveIntFromEnv('DEFAULT_PAGE_SIZE', 20),
  },

  // Rate-limit thresholds. Issue #1680.
  rateLimit: {
    // Window length in milliseconds.
    windowMs: positiveIntFromEnv('RATE_LIMIT_WINDOW_MS', 60000),
    // Max requests per window for general API traffic.
    maxRequests: positiveIntFromEnv('RATE_LIMIT_MAX_REQUESTS', 100),
    // Max requests per window for authentication endpoints.
    authMaxRequests: positiveIntFromEnv('RATE_LIMIT_AUTH_MAX_REQUESTS', 10),
    // Max requests per window for webhook registration/management.
    webhookMaxRequests: positiveIntFromEnv('RATE_LIMIT_WEBHOOK_MAX_REQUESTS', 30),
  },

  // File Storage
  storage: {
    driver: (process.env.STORAGE_DRIVER || 'local') as 's3' | 'local',
    s3Bucket: process.env.S3_BUCKET || '',
    s3Region: process.env.S3_REGION || 'us-east-1',
    s3AccessKey: process.env.S3_ACCESS_KEY_ID || '',
    s3SecretKey: process.env.S3_SECRET_ACCESS_KEY || '',
    localUploadDir: process.env.LOCAL_UPLOAD_DIR || './uploads',
    // Master key for at-rest document envelope encryption (local driver).
    // Falls back to the PHI field-encryption key when unset.
    documentEncryptionKey:
      process.env.DOCUMENT_ENCRYPTION_KEY || process.env.FIELD_ENCRYPTION_KEY || '',
  },
};

/**
 * Validate cross-field configuration invariants. Throws on invalid values so
 * the process fails fast at startup rather than at first use.
 */
function validateConfig(): void {
  const errors: string[] = [];

  if (config.batch.defaultPageSize > config.batch.maxPageSize) {
    errors.push(
      `DEFAULT_PAGE_SIZE (${config.batch.defaultPageSize}) must not exceed MAX_PAGE_SIZE (${config.batch.maxPageSize})`
    );
  }

  if (config.rateLimit.authMaxRequests > config.rateLimit.maxRequests) {
    errors.push(
      `RATE_LIMIT_AUTH_MAX_REQUESTS (${config.rateLimit.authMaxRequests}) must not exceed RATE_LIMIT_MAX_REQUESTS (${config.rateLimit.maxRequests})`
    );
  }

  if (errors.length > 0) {
    throw new Error(`Invalid configuration:\n  - ${errors.join('\n  - ')}`);
  }
}

validateConfig();

if (['development', 'staging'].includes(process.env.NODE_ENV || 'development')) {
  logSecretsStatus();
}
