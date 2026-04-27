/**
 * Validates that all required environment variables are set.
 * Exits with code 1 if any are missing (all envs) or throws in production.
 */
const REQUIRED_VARS = [
  'MONGO_URI',
  'JWT_ACCESS_TOKEN_SECRET',
  'JWT_REFRESH_TOKEN_SECRET',
  'STELLAR_PLATFORM_PUBLIC_KEY',
  'STELLAR_SECRET_KEY',
  'FIELD_ENCRYPTION_KEY',
  'KEYPAIR_ENCRYPTION_KEY',
] as const;

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
}

export function logSecretsStatus(): void {
  for (const key of REQUIRED_VARS) {
    const set = Boolean(process.env[key]);
    console.log(`  ${set ? '✅' : '⚠️  missing'} ${key}`);
  }
}
