/**
 * Secrets Manager Integration
 * Supports AWS Secrets Manager, HashiCorp Vault, and environment variables
 */

interface SecretsManagerConfig {
  type: 'env' | 'aws' | 'vault';
  cacheEnabled?: boolean;
  cacheTTL?: number; // in seconds
}

interface CachedSecret {
  value: Record<string, string>;
  timestamp: number;
}

const secretCache = new Map<string, CachedSecret>();

/**
 * Load secrets from AWS Secrets Manager
 */
async function loadFromAWSSecretsManager(secretName: string): Promise<Record<string, string>> {
  try {
    const { SecretsManagerClient, GetSecretValueCommand } = await import('@aws-sdk/client-secrets-manager');
    
    const client = new SecretsManagerClient({
      region: process.env.AWS_REGION || 'us-east-1',
    });

    const command = new GetSecretValueCommand({ SecretId: secretName });
    const response = await client.send(command);

    if (!response.SecretString) {
      throw new Error('SecretString not found in response');
    }

    return JSON.parse(response.SecretString);
  } catch (error) {
    console.error(`❌ Failed to load secrets from AWS Secrets Manager (${secretName}):`, error);
    throw error;
  }
}

/**
 * Load secrets from HashiCorp Vault
 */
async function loadFromVault(path: string): Promise<Record<string, string>> {
  try {
    const axios = await import('axios');
    
    const vaultAddr = process.env.VAULT_ADDR || 'http://127.0.0.1:8200';
    const vaultToken = process.env.VAULT_TOKEN || '';

    if (!vaultToken) {
      throw new Error('VAULT_TOKEN not set');
    }

    const client = axios.default.create({
      baseURL: vaultAddr,
      headers: { 'X-Vault-Token': vaultToken },
    });

    const response = await client.get(`/v1/${path}`);
    
    // Vault KV v2 stores data nested under 'data'
    return response.data.data.data;
  } catch (error) {
    console.error(`❌ Failed to load secrets from Vault (${path}):`, error);
    throw error;
  }
}

/**
 * Load secrets from environment variables
 */
function loadFromEnvironment(): Record<string, string> {
  const secrets: Record<string, string> = {};
  
  const requiredVars = [
    'MONGO_URI',
    'JWT_ACCESS_TOKEN_SECRET',
    'JWT_REFRESH_TOKEN_SECRET',
    'STELLAR_SECRET_KEY',
    'GEMINI_API_KEY',
  ];

  requiredVars.forEach((key) => {
    if (process.env[key]) {
      secrets[key] = process.env[key]!;
    }
  });

  return secrets;
}

/**
 * Load secrets from configured manager
 * Supports caching to reduce API calls
 */
export async function loadSecrets(config: SecretsManagerConfig): Promise<Record<string, string>> {
  const cacheKey = `${config.type}:${process.env.NODE_ENV || 'development'}`;
  
  // Check cache
  if (config.cacheEnabled && secretCache.has(cacheKey)) {
    const cached = secretCache.get(cacheKey)!;
    const age = (Date.now() - cached.timestamp) / 1000;
    
    if (age < (config.cacheTTL || 3600)) {
      console.log(`📦 Using cached secrets (${age.toFixed(0)}s old)`);
      return cached.value;
    }
    
    secretCache.delete(cacheKey);
  }

  let secrets: Record<string, string>;

  switch (config.type) {
    case 'aws':
      console.log('🔐 Loading secrets from AWS Secrets Manager...');
      const environment = process.env.NODE_ENV || 'development';
      secrets = await loadFromAWSSecretsManager(`health-watchers/${environment}/api`);
      break;

    case 'vault':
      console.log('🔐 Loading secrets from HashiCorp Vault...');
      const vaultPath = `secret/data/health-watchers/${process.env.NODE_ENV || 'development'}`;
      secrets = await loadFromVault(vaultPath);
      break;

    case 'env':
    default:
      console.log('🔐 Loading secrets from environment variables...');
      secrets = loadFromEnvironment();
      break;
  }

  // Cache secrets if enabled
  if (config.cacheEnabled) {
    secretCache.set(cacheKey, {
      value: secrets,
      timestamp: Date.now(),
    });
  }

  return secrets;
}

/**
 * Initialize secrets on application startup
 */
export async function initializeSecrets(): Promise<void> {
  const isDevelopment = process.env.NODE_ENV === 'development';
  const useSecretsManager = process.env.ENABLE_SECRETS_MANAGER === 'true';

  if (!isDevelopment && useSecretsManager) {
    const managerType = process.env.SECRETS_MANAGER_TYPE || 'aws';
    
    try {
      const config: SecretsManagerConfig = {
        type: managerType as 'env' | 'aws' | 'vault',
        cacheEnabled: true,
        cacheTTL: 3600, // 1 hour
      };

      const secrets = await loadSecrets(config);
      
      // Merge secrets into process.env
      Object.entries(secrets).forEach(([key, value]) => {
        if (!process.env[key]) {
          process.env[key] = value;
        }
      });

      console.log('✅ Secrets loaded successfully');
    } catch (error) {
      console.error('❌ Failed to initialize secrets:', error);
      process.exit(1);
    }
  } else if (isDevelopment) {
    console.log('ℹ️ Development mode: Using environment variables (.env)');
  }
}

/**
 * Refresh cached secrets
 */
export async function refreshSecrets(config: SecretsManagerConfig): Promise<Record<string, string>> {
  const cacheKey = `${config.type}:${process.env.NODE_ENV || 'development'}`;
  secretCache.delete(cacheKey);
  return loadSecrets(config);
}

export default {
  loadSecrets,
  initializeSecrets,
  refreshSecrets,
};
