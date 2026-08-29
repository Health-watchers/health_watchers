/**
 * Config Service — centralized, type-safe configuration access.
 *
 * All application configuration is sourced from environment variables validated
 * in `./env.ts` (via Zod). This service provides a single import path for any
 * module that needs configuration values and avoids scattered `process.env`
 * lookups throughout the codebase.
 *
 * Usage:
 *   import { appConfig } from '@api/config/config.service';
 *   const port = appConfig.api.port;
 *
 *   import { configService } from '@api/config/config.service';
 *   const isProduction = configService.isProduction();
 *
 * Note: The shared `@health-watchers/config` package performs its own env
 * loading and is intended for cross-app consumption. This service is the
 * canonical config entrypoint for the API app specifically.
 */

import { env } from './env';

/**
 * Fully typed application configuration, composed from validated env vars.
 */
export const appConfig = {
  /** HTTP server */
  api: {
    port: parseInt(env.API_PORT, 10),
    nodeEnv: process.env.NODE_ENV ?? 'development',
    trustProxy: process.env.TRUST_PROXY,
    maxRequestBodySize: process.env.MAX_REQUEST_BODY_SIZE ?? '10kb',
    aiRequestBodySize: process.env.AI_REQUEST_BODY_SIZE ?? '50kb',
    allowedOrigins: (process.env.ALLOWED_ORIGINS || 'http://localhost:3000')
      .split(',')
      .map((o) => o.trim())
      .filter(Boolean),
  },

  /** Database */
  db: {
    mongoUri: env.MONGO_URI,
    maxPoolSize: parseInt(process.env.MONGO_MAX_POOL_SIZE ?? '10', 10),
  },

  /** JWT authentication */
  jwt: {
    accessTokenSecret: env.JWT_ACCESS_TOKEN_SECRET,
    refreshTokenSecret: env.JWT_REFRESH_TOKEN_SECRET,
    tempTokenSecret: process.env.JWT_TEMP_TOKEN_SECRET ?? '',
    issuer: process.env.JWT_ISSUER ?? 'health-watchers-api',
    audience: process.env.JWT_AUDIENCE ?? 'health-watchers-client',
    accessTokenExpiry: process.env.JWT_ACCESS_TOKEN_EXPIRY ?? '15m',
    refreshTokenExpiry: process.env.JWT_REFRESH_TOKEN_EXPIRY ?? '7d',
  },

  /** Stellar blockchain */
  stellar: {
    network: env.STELLAR_NETWORK,
    horizonUrl:
      env.STELLAR_NETWORK === 'mainnet'
        ? 'https://horizon.stellar.org'
        : 'https://horizon-testnet.stellar.org',
    secretKey: process.env.STELLAR_SECRET_KEY ?? '',
    platformPublicKey: process.env.STELLAR_PLATFORM_PUBLIC_KEY ?? '',
    usdcIssuer:
      env.STELLAR_NETWORK === 'mainnet'
        ? 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN'
        : 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5',
    serviceUrl: process.env.STELLAR_SERVICE_URL ?? 'http://localhost:3002',
    supportedAssets: (process.env.SUPPORTED_ASSETS ?? 'XLM')
      .split(',')
      .map((a) => a.trim().toUpperCase())
      .filter(Boolean),
  },

  /** AI / LLM */
  ai: {
    geminiApiKey: env.GEMINI_API_KEY ?? '',
  },

  /** Encryption */
  encryption: {
    fieldEncryptionKey: process.env.FIELD_ENCRYPTION_KEY ?? '',
    keypairEncryptionKey: process.env.KEYPAIR_ENCRYPTION_KEY ?? '',
  },

  /** Email */
  email: {
    provider: (process.env.EMAIL_PROVIDER ?? 'smtp') as 'smtp' | 'sendgrid',
    from: process.env.EMAIL_FROM ?? 'noreply@healthwatchers.com',
    smtp: {
      host: process.env.SMTP_HOST ?? 'localhost',
      port: Number(process.env.SMTP_PORT ?? 587),
      secure: process.env.SMTP_SECURE === 'true',
      user: process.env.SMTP_USER ?? '',
      pass: process.env.SMTP_PASS ?? '',
    },
    sendgridApiKey: process.env.SENDGRID_API_KEY ?? '',
  },

  /** File storage */
  storage: {
    driver: (process.env.STORAGE_DRIVER ?? 'local') as 's3' | 'local',
    s3Bucket: process.env.S3_BUCKET ?? '',
    s3Region: process.env.S3_REGION ?? 'us-east-1',
    s3AccessKeyId: process.env.S3_ACCESS_KEY_ID ?? '',
    s3SecretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? '',
    localUploadDir: process.env.LOCAL_UPLOAD_DIR ?? './uploads',
  },

  /** Redis (rate limiting, caching, BullMQ) */
  redis: {
    url: env.REDIS_URL ?? 'redis://localhost:6379',
  },

  /** Logging */
  logging: {
    level: env.LOG_LEVEL,
    sentryDsn: env.SENTRY_DSN,
  },

  /** Web frontend (for CORS, emails, etc.) */
  web: {
    url: env.WEB_URL,
  },
} as const;

export type AppConfig = typeof appConfig;

/**
 * Type-safe config accessor.
 * Provides helper methods and section-level access.
 *
 * @example
 *   configService.isProduction()
 *   configService.get('stellar')
 */
export const configService = {
  /**
   * Retrieve a top-level configuration section.
   * @param key - One of the top-level config keys: 'api', 'db', 'jwt', etc.
   */
  get<K extends keyof AppConfig>(key: K): AppConfig[K] {
    return appConfig[key];
  },

  /** Returns true when NODE_ENV is 'production'. */
  isProduction(): boolean {
    return appConfig.api.nodeEnv === 'production';
  },

  /** Returns true when NODE_ENV is 'test'. */
  isTest(): boolean {
    return appConfig.api.nodeEnv === 'test';
  },

  /** Returns true when NODE_ENV is 'development'. */
  isDevelopment(): boolean {
    return appConfig.api.nodeEnv === 'development';
  },
};
