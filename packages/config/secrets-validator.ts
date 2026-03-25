import type { AppRole } from '@health-watchers/types';

/**
 * Secrets validation and configuration
 * Ensures all required secrets are present at startup
 * Supports both environment variables and Secrets Manager
 */

export interface SecretsConfig {
  // Database
  mongoUri: string;
  
  // JWT Authentication
  jwtAccessTokenSecret: string;
  jwtRefreshTokenSecret: string;
  
  // Stellar Blockchain
  stellarNetwork: 'testnet' | 'mainnet';
  stellarSecretKey: string;
  
  // AI/LLM
  geminiApiKey: string;
  
  // Application
  apiPort: string | number;
  nodeEnv: 'development' | 'staging' | 'production';
}

/**
 * List of required secrets that must be present
 * Grouped by criticality for rotation scheduling
 */
export const REQUIRED_SECRETS = {
  critical: [
    'JWT_ACCESS_TOKEN_SECRET',
    'JWT_REFRESH_TOKEN_SECRET',
    'MONGO_URI',
  ],
  highRisk: [
    'STELLAR_SECRET_KEY',
    'GEMINI_API_KEY',
  ],
  standard: [
    'STELLAR_NETWORK',
    'API_PORT',
    'NODE_ENV',
  ],
};

/**
 * Validate that all required secrets are present
 * Throws error and exits if any required secrets are missing
 */
export const validateSecrets = (secrets: Record<string, string | undefined>): void => {
  const allRequired = [
    ...REQUIRED_SECRETS.critical,
    ...REQUIRED_SECRETS.highRisk,
    ...REQUIRED_SECRETS.standard,
  ];

  const missing = allRequired.filter(
    (secret) => !secrets[secret] || secrets[secret]!.trim().length === 0
  );

  if (missing.length > 0) {
    console.error('❌ FATAL: Missing required environment variables:');
    missing.forEach((secret) => {
      const isCritical = REQUIRED_SECRETS.critical.includes(secret);
      const icon = isCritical ? '🔒' : '⚠️';
      console.error(`  ${icon} ${secret}`);
    });
    console.error('');
    console.error('Please ensure all required secrets are set.');
    console.error('See .env.example and SECURITY.md for details.');
    console.error('');
    process.exit(1);
  }
};

/**
 * Validate secret format and strength
 */
export const validateSecretStrength = (secret: string, name: string, minLength: number = 32): void => {
  if (secret.length < minLength) {
    throw new Error(
      `❌ Secret "${name}" is too weak. ` +
      `Minimum length: ${minLength}, actual: ${secret.length}. ` +
      `See SECURITY.md for secret generation instructions.`
    );
  }

  // Check for obvious test values
  const testPatterns = [
    /test/i,
    /debug/i,
    /example/i,
    /dummy/i,
    /placeholder/i,
    /change.?in.?production/i,
  ];

  if (process.env.NODE_ENV === 'production') {
    for (const pattern of testPatterns) {
      if (pattern.test(secret)) {
        throw new Error(
          `❌ Secret "${name}" appears to be a test/placeholder value in PRODUCTION. ` +
          `This is a critical security issue. Update immediately.`
        );
      }
    }
  }
};

/**
 * Get secrets from environment
 */
export const getSecretsFromEnvironment = (): Partial<SecretsConfig> => {
  return {
    mongoUri: process.env.MONGO_URI,
    jwtAccessTokenSecret: process.env.JWT_ACCESS_TOKEN_SECRET,
    jwtRefreshTokenSecret: process.env.JWT_REFRESH_TOKEN_SECRET,
    stellarNetwork: (process.env.STELLAR_NETWORK ?? 'testnet') as 'testnet' | 'mainnet',
    stellarSecretKey: process.env.STELLAR_SECRET_KEY,
    geminiApiKey: process.env.GEMINI_API_KEY,
    apiPort: process.env.API_PORT ?? '3001',
    nodeEnv: (process.env.NODE_ENV ?? 'development') as 'development' | 'staging' | 'production',
  };
};

/**
 * Validate JWT secret strength
 */
export const validateJwtSecrets = (accessSecret: string, refreshSecret: string): void => {
  validateSecretStrength(accessSecret, 'JWT_ACCESS_TOKEN_SECRET', 64);
  validateSecretStrength(refreshSecret, 'JWT_REFRESH_TOKEN_SECRET', 64);

  if (accessSecret === refreshSecret) {
    throw new Error(
      '❌ JWT_ACCESS_TOKEN_SECRET and JWT_REFRESH_TOKEN_SECRET must be different. ' +
      'Generate two separate secrets using: node -e "console.log(require(\'crypto\').randomBytes(64).toString(\'hex\'))"'
    );
  }
};

/**
 * Validate MongoDB connection string
 */
export const validateMongoUri = (uri: string): void => {
  if (!uri.startsWith('mongodb://') && !uri.startsWith('mongodb+srv://')) {
    throw new Error(
      '❌ Invalid MONGO_URI format. ' +
      'Must start with "mongodb://" or "mongodb+srv://"'
    );
  }

  if (process.env.NODE_ENV === 'production') {
    if (uri.includes('localhost') || uri.includes('127.0.0.1')) {
      throw new Error(
        '❌ MONGO_URI points to localhost in PRODUCTION. ' +
        'Use remote database connection.'
      );
    }

    if (!uri.includes('?')) {
      console.warn(
        '⚠️ WARNING: MONGO_URI missing connection options. ' +
        'Consider adding: ?authSource=admin&ssl=true'
      );
    }
  }
};

/**
 * Validate Stellar configuration
 */
export const validateStellarConfig = (secretKey: string, network: 'testnet' | 'mainnet'): void => {
  if (network === 'mainnet' && !secretKey.startsWith('SA')) {
    throw new Error(
      '❌ Invalid Stellar secret key. Must start with "SA"'
    );
  }

  if (network === 'mainnet') {
    validateSecretStrength(secretKey, 'STELLAR_SECRET_KEY', 56);
  }

  if (network === 'mainnet' && process.env.NODE_ENV === 'development') {
    console.warn(
      '⚠️ WARNING: STELLAR_NETWORK is set to "mainnet" in development. ' +
      'This will use REAL money for transactions.'
    );
  }
};

/**
 * Startup secrets validation
 * Call this early in application initialization
 */
export const validateStartupSecrets = (): void => {
  console.log('🔒 Validating secrets configuration...');

  const env = getSecretsFromEnvironment();

  // Required secrets check
  validateSecrets(process.env);

  // Format and strength validation
  validateMongoUri(env.mongoUri!);
  validateJwtSecrets(env.jwtAccessTokenSecret!, env.jwtRefreshTokenSecret!);
  validateStellarConfig(env.stellarSecretKey!, env.stellarNetwork!);

  console.log('✅ All secrets validated successfully');
};

/**
 * Log which secrets are configured (without revealing values)
 */
export const logSecretsStatus = (): void => {
  console.log('📋 Secrets Configuration Status:');
  console.log('  🔒 Critical (rotate monthly):');
  REQUIRED_SECRETS.critical.forEach((secret) => {
    const status = process.env[secret] ? '✓' : '✗';
    console.log(`    ${status} ${secret}`);
  });

  console.log('  ⚠️  High-Risk (rotate quarterly):');
  REQUIRED_SECRETS.highRisk.forEach((secret) => {
    const status = process.env[secret] ? '✓' : '✗';
    console.log(`    ${status} ${secret}`);
  });
};

export default {
  validateSecrets,
  validateSecretStrength,
  validateStartupSecrets,
  logSecretsStatus,
  getSecretsFromEnvironment,
};
