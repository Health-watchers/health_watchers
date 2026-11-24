import dotenv from 'dotenv';
import path from 'path';
import { z } from 'zod';

if (process.env.NODE_ENV !== 'production') {
  dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
}

// ── Schema ──────────────────────────────────────────────────────────

const stellarConfigSchema = z.object({
  STELLAR_NETWORK: z.enum(['mainnet', 'testnet']).default('testnet'),
  MAINNET_CONFIRMED: z
    .string()
    .transform((v) => v === 'true')
    .default('false'),
  STELLAR_DRY_RUN: z
    .string()
    .transform((v) => v === 'true')
    .default('false'),
  STELLAR_MAX_TRANSACTION_XLM: z.string().default('1000'),
  STELLAR_PORT: z.string().optional(),
  STELLAR_SERVICE_PORT: z.string().optional(),
  STELLAR_PLATFORM_PUBLIC_KEY: z.string().default(''),
  STELLAR_SECRET_KEY: z.string().min(1, 'STELLAR_SECRET_KEY is required'),
  API_URL: z.string().url().default('http://localhost:3000'),
  STELLAR_SERVICE_SECRET: z.string().min(1, 'STELLAR_SERVICE_SECRET is required'),
  STELLAR_HORIZON_URLS: z.string().optional(),
  STELLAR_HORIZON_TIMEOUT_MS: z.string().default('30000'),
  STELLAR_MAX_RETRIES: z.string().default('3'),
  STELLAR_RETRY_DELAY_MS: z.string().default('1000'),
  STELLAR_BATCH_SIZE: z.string().default('50'),
});

// ── Validation ──────────────────────────────────────────────────────

const parsed = stellarConfigSchema.safeParse(process.env);

if (!parsed.success) {
  const errors = parsed.error.issues
    .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
    .join('\n');
  console.error(`FATAL: Stellar service configuration is invalid:\n${errors}`);
  process.exit(1);
}

const cfg = parsed.data;

// Mainnet safety: MAINNET_CONFIRMED must be true when using mainnet Horizon URLs.
const isMainnet = cfg.STELLAR_NETWORK === 'mainnet';
const customHorizonUrls = cfg.STELLAR_HORIZON_URLS?.split(',').map((u) => u.trim()).filter(Boolean);
const usesMainnetHorizon =
  isMainnet && (!customHorizonUrls || customHorizonUrls.some((u) => u.includes('stellar.org')));

if (usesMainnetHorizon && !cfg.MAINNET_CONFIRMED) {
  console.error(
    "FATAL: MAINNET_CONFIRMED must be 'true' when STELLAR_NETWORK=mainnet and mainnet Horizon URLs are used."
  );
  process.exit(1);
}

// ── Exported config ─────────────────────────────────────────────────

function getHorizonUrls(): string[] {
  if (customHorizonUrls.length > 0) return customHorizonUrls;
  if (isMainnet) {
    return ['https://horizon.stellar.org', 'https://horizon.stellar.lobstr.co'];
  }
  return ['https://horizon-testnet.stellar.org', 'https://horizon.stellar.lobstr.co/testnet'];
}

export const stellarConfig = {
  network: cfg.STELLAR_NETWORK,
  mainnetConfirmed: cfg.MAINNET_CONFIRMED,
  dryRun: cfg.STELLAR_DRY_RUN,
  maxTransactionXlm: parseFloat(cfg.STELLAR_MAX_TRANSACTION_XLM),
  port: cfg.STELLAR_PORT || cfg.STELLAR_SERVICE_PORT || '3002',
  platformPublicKey: cfg.STELLAR_PLATFORM_PUBLIC_KEY,
  stellarSecretKey: cfg.STELLAR_SECRET_KEY,
  apiUrl: cfg.API_URL,
  sharedSecret: cfg.STELLAR_SERVICE_SECRET,
  horizonUrl: isMainnet ? 'https://horizon.stellar.org' : 'https://horizon-testnet.stellar.org',
  horizonUrls: getHorizonUrls(),
  horizonTimeoutMs: parseInt(cfg.STELLAR_HORIZON_TIMEOUT_MS, 10),
  maxRetries: parseInt(cfg.STELLAR_MAX_RETRIES, 10),
  retryDelayMs: parseInt(cfg.STELLAR_RETRY_DELAY_MS, 10),
  batchSize: parseInt(cfg.STELLAR_BATCH_SIZE, 10),
};
