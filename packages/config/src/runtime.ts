export interface RuntimeConfig {
  serviceName: string;
  serviceVersion: string;
  databaseUrl: string;
  redisUrl?: string;
  encryptionKeyRef?: string;
}

export function loadRuntimeConfig(env: NodeJS.ProcessEnv = process.env): RuntimeConfig {
  return {
    serviceName: env.SERVICE_NAME || "health-watchers",
    serviceVersion: env.SERVICE_VERSION || "dev",
    databaseUrl: env.DATABASE_URL || "mongodb://localhost:27017/health_watchers",
    redisUrl: env.REDIS_URL,
    encryptionKeyRef: env.DATA_ENCRYPTION_KEY_REF,
  };
}
