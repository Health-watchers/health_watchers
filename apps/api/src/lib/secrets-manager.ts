/**
 * AWS Secrets Manager loader for field-level encryption keys.
 *
 * Precedence (non-breaking):
 *   1. If `FIELD_ENCRYPTION_KEY` is already present in the environment
 *      (k8s ExternalSecrets / Helm / Terraform injection), this is a no-op.
 *   2. Otherwise, if `AWS_SECRETS_MANAGER_SECRET_ID` is set, the secret is
 *      fetched and its keys are hydrated into `process.env`.
 *   3. Otherwise, nothing happens and the existing HIPAA guard in
 *      `config/env.ts` decides whether to abort startup.
 *
 * The secret is expected to be a JSON object:
 *   {
 *     "FIELD_ENCRYPTION_KEY": "<64 hex chars>",
 *     "FIELD_ENCRYPTION_KEY_VERSION": "1",
 *     "FIELD_ENCRYPTION_BLIND_INDEX_KEY": "<64 hex chars>"
 *   }
 */

const HEX_64 = /^[0-9a-f]{64}$/i;

export interface SecretsManagerClientLike {
  send(command: unknown): Promise<{ SecretString?: string }>;
}

export interface LoadSecretsOptions {
  /** Injectable client (tests). Defaults to a lazily-created AWS SDK client. */
  client?: SecretsManagerClientLike;
  /** Injectable env object (tests). Defaults to `process.env`. */
  env?: NodeJS.ProcessEnv;
  /** Injectable logger. */
  logger?: Pick<Console, 'info' | 'warn' | 'error'>;
}

function assertHex64(name: string, value: unknown): string {
  if (typeof value !== 'string' || !HEX_64.test(value)) {
    throw new Error(`${name} from AWS Secrets Manager must be a 64-char hex string (32 bytes)`);
  }
  return value;
}

async function defaultClient(region: string): Promise<SecretsManagerClientLike> {
  // Imported lazily so the SDK is only loaded when actually needed.
  const { SecretsManagerClient } = await import('@aws-sdk/client-secrets-manager');
  return new SecretsManagerClient({ region }) as unknown as SecretsManagerClientLike;
}

/**
 * Hydrates field-encryption secrets into `process.env`.
 * Safe to call multiple times; returns early when the key is already set.
 */
export async function loadFieldEncryptionSecrets(options: LoadSecretsOptions = {}): Promise<void> {
  const env = options.env ?? process.env;
  const logger = options.logger ?? console;

  // 1. Environment injection wins (existing deployment model).
  if (env.FIELD_ENCRYPTION_KEY) return;

  const secretId = env.AWS_SECRETS_MANAGER_SECRET_ID;
  // 2. Nothing configured — fall through to the HIPAA guard.
  if (!secretId) return;

  const region = env.AWS_REGION || env.AWS_DEFAULT_REGION || 'us-east-1';

  try {
    const client = options.client ?? (await defaultClient(region));
    const { GetSecretValueCommand } = await import('@aws-sdk/client-secrets-manager');
    const response = await client.send(new GetSecretValueCommand({ SecretId: secretId }));

    if (!response.SecretString) {
      throw new Error(`AWS Secrets Manager secret "${secretId}" has no SecretString`);
    }

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(response.SecretString) as Record<string, unknown>;
    } catch {
      throw new Error(`AWS Secrets Manager secret "${secretId}" is not valid JSON`);
    }

    const key = assertHex64('FIELD_ENCRYPTION_KEY', parsed.FIELD_ENCRYPTION_KEY);
    const blindIndexKey = assertHex64(
      'FIELD_ENCRYPTION_BLIND_INDEX_KEY',
      parsed.FIELD_ENCRYPTION_BLIND_INDEX_KEY
    );

    env.FIELD_ENCRYPTION_KEY = key;
    env.FIELD_ENCRYPTION_BLIND_INDEX_KEY = blindIndexKey;
    if (parsed.FIELD_ENCRYPTION_KEY_VERSION !== undefined) {
      env.FIELD_ENCRYPTION_KEY_VERSION = String(parsed.FIELD_ENCRYPTION_KEY_VERSION);
    }

    logger.info('[secrets-manager] Field encryption keys loaded from AWS Secrets Manager');
  } catch (error) {
    logger.error('[secrets-manager] Failed to load field encryption secrets', error);
    throw error;
  }
}
