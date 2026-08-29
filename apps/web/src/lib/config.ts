/**
 * Web App Config Service
 *
 * Single source of truth for all environment-variable-backed configuration
 * in the Next.js web app. All `process.env` reads for public/server vars are
 * centralised here — no other file should read `process.env` directly.
 *
 * Usage:
 *   import { webConfig } from '@/lib/config';
 *   const apiUrl = webConfig.api.url;
 *   const isProd  = webConfig.isProd();
 *
 * Public env vars (NEXT_PUBLIC_*) are safe to import in Client Components.
 * Server-only vars (no NEXT_PUBLIC_ prefix) are only safe in Server Components,
 * API routes, and middleware.
 *
 * Note: Build-time vs. run-time
 * Next.js inlines NEXT_PUBLIC_* values at build time.  Non-public vars are
 * resolved at request time in the Node.js runtime (Server Components / API
 * routes). Keep this distinction in mind when using this file.
 */

// ── Public config (safe in Client & Server Components) ────────────────────────

const publicConfig = {
  /** Base URL of the API service, e.g. http://localhost:3001 */
  apiUrl: process.env.NEXT_PUBLIC_API_URL ?? '',

  /** Stellar network — 'testnet' | 'mainnet' */
  stellarNetwork: (process.env.NEXT_PUBLIC_STELLAR_NETWORK ?? 'testnet') as 'testnet' | 'mainnet',

  /** CDN origin URL; empty string means serve assets from the same origin */
  cdnUrl: process.env.NEXT_PUBLIC_CDN_URL ?? '',

  /** CDN provider identifier */
  cdnProvider: (process.env.NEXT_PUBLIC_CDN_PROVIDER ?? 'custom') as
    | 'cloudflare'
    | 'cloudfront'
    | 'fastly'
    | 'custom',

  /** Support email shown in error pages */
  supportEmail: process.env.NEXT_PUBLIC_SUPPORT_EMAIL ?? '',

  /** Application version, used for cache-busting */
  appVersion: process.env.NEXT_PUBLIC_APP_VERSION ?? 'latest',
} as const;

// ── Server-only config (safe in Server Components / API routes only) ──────────

const serverConfig = {
  /** Runtime environment */
  nodeEnv: (process.env.NODE_ENV ?? 'development') as 'development' | 'production' | 'test',

  /** CDN provider API key — never expose to the client */
  cdnApiKey: process.env.CDN_API_KEY,

  /** Cloudflare zone ID */
  cloudflareZoneId: process.env.CLOUDFLARE_ZONE_ID,

  /** CloudFront distribution ID */
  cloudfrontDistributionId: process.env.CLOUDFRONT_DISTRIBUTION_ID,

  /** Fastly API key */
  fastlyApiKey: process.env.FASTLY_API_KEY,
} as const;

// ── Composed config object ─────────────────────────────────────────────────────

export const webConfig = {
  /** API connectivity */
  api: {
    url: publicConfig.apiUrl,
    v1BaseUrl: publicConfig.apiUrl ? `${publicConfig.apiUrl.replace(/\/$/, '')}/api/v1` : '/api/v1',
    v2BaseUrl: publicConfig.apiUrl ? `${publicConfig.apiUrl.replace(/\/$/, '')}/api/v2` : '/api/v2',
  },

  /** Stellar / blockchain */
  stellar: {
    network: publicConfig.stellarNetwork,
    isTestnet: publicConfig.stellarNetwork === 'testnet',
    horizonUrl:
      publicConfig.stellarNetwork === 'mainnet'
        ? 'https://horizon.stellar.org'
        : 'https://horizon-testnet.stellar.org',
  },

  /** CDN */
  cdn: {
    url: publicConfig.cdnUrl,
    provider: publicConfig.cdnProvider,
    /** Server-only — do not access in Client Components */
    apiKey: serverConfig.cdnApiKey,
    cloudflareZoneId: serverConfig.cloudflareZoneId,
    cloudfrontDistributionId: serverConfig.cloudfrontDistributionId,
    fastlyApiKey: serverConfig.fastlyApiKey,
    cacheMaxAge: 31_536_000, // 1 year — for immutable assets
    staleWhileRevalidate: 86_400, // 1 day
  },

  /** UX / branding */
  app: {
    version: publicConfig.appVersion,
    supportEmail: publicConfig.supportEmail,
  },

  /** Runtime helpers */

  /** Returns true when running in a production environment. */
  isProd(): boolean {
    return serverConfig.nodeEnv === 'production';
  },

  /** Returns true when running in development. */
  isDev(): boolean {
    return serverConfig.nodeEnv === 'development';
  },

  /** Returns true when running inside the test runner. */
  isTest(): boolean {
    return serverConfig.nodeEnv === 'test';
  },
} as const;

export type WebConfig = typeof webConfig;
