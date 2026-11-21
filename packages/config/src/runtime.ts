export interface RuntimeConfig {
  serviceName: string;
  serviceVersion: string;
  databaseUrl: string;
  redisUrl?: string;
  encryptionKeyRef?: string;
  timeouts: {
    requestMs: number;
    upstreamMs: number;
    idleMs: number;
  };
  retries: {
    maxAttempts: number;
    baseDelayMs: number;
    maxDelayMs: number;
  };
  batchSizes: {
    default: number;
    max: number;
    export: number;
  };
  rateLimits: {
    windowMs: number;
    maxRequests: number;
    burst: number;
  };
}

function parseIntEnv(
  env: NodeJS.ProcessEnv,
  key: string,
  defaultValue: number,
  { min, max }: { min?: number; max?: number } = {},
): number {
  const raw = env[key];
  if (raw === undefined || raw === "") {
    return defaultValue;
  }
  const parsed = Number.parseInt(raw, 10);
  if (Number.isNaN(parsed)) {
    throw new Error(`Invalid configuration: ${key} must be an integer, got "${raw}"`);
  }
  if (min !== undefined && parsed < min) {
    throw new Error(`Invalid configuration: ${key} must be >= ${min}, got ${parsed}`);
  }
  if (max !== undefined && parsed > max) {
    throw new Error(`Invalid configuration: ${key} must be <= ${max}, got ${parsed}`);
  }
  return parsed;
}

export function loadRuntimeConfig(env: NodeJS.ProcessEnv = process.env): RuntimeConfig {
  return {
    serviceName: env.SERVICE_NAME || "health-watchers",
    serviceVersion: env.SERVICE_VERSION || "dev",
    databaseUrl: env.DATABASE_URL || "mongodb://localhost:27017/health_watchers",
    redisUrl: env.REDIS_URL,
    encryptionKeyRef: env.DATA_ENCRYPTION_KEY_REF,
    timeouts: {
      requestMs: parseIntEnv(env, "REQUEST_TIMEOUT_MS", 30000, { min: 1 }),
      upstreamMs: parseIntEnv(env, "UPSTREAM_TIMEOUT_MS", 5000, { min: 1 }),
      idleMs: parseIntEnv(env, "IDLE_TIMEOUT_MS", 60000, { min: 1 }),
    },
    retries: {
      maxAttempts: parseIntEnv(env, "RETRY_MAX_ATTEMPTS", 3, { min: 0, max: 100 }),
      baseDelayMs: parseIntEnv(env, "RETRY_BASE_DELAY_MS", 200, { min: 0 }),
      maxDelayMs: parseIntEnv(env, "RETRY_MAX_DELAY_MS", 5000, { min: 0 }),
    },
    batchSizes: {
      default: parseIntEnv(env, "BATCH_SIZE_DEFAULT", 100, { min: 1 }),
      max: parseIntEnv(env, "BATCH_SIZE_MAX", 1000, { min: 1 }),
      export: parseIntEnv(env, "BATCH_SIZE_EXPORT", 500, { min: 1 }),
    },
    rateLimits: {
      windowMs: parseIntEnv(env, "RATE_LIMIT_WINDOW_MS", 60000, { min: 1 }),
      maxRequests: parseIntEnv(env, "RATE_LIMIT_MAX_REQUESTS", 100, { min: 1 }),
      burst: parseIntEnv(env, "RATE_LIMIT_BURST", 20, { min: 0 }),
    },
  };
}