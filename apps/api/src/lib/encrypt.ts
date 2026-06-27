import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALGO = 'aes-256-gcm';
const IV_LEN = 12;

/**
 * Resolves the active encryption key and builds a map of all versioned keys for
 * decryption during key rotation.
 *
 * Key management:
 *   - Set FIELD_ENCRYPTION_KEY to the current (latest) key (64-char hex).
 *   - Set FIELD_ENCRYPTION_KEY_VERSION to the numeric version of that key (default: 1).
 *   - During rotation, keep the old key accessible via a versioned env var:
 *       FIELD_ENCRYPTION_KEY_V<n>=<64-char hex>
 *     e.g. FIELD_ENCRYPTION_KEY_V1=<old key>  while FIELD_ENCRYPTION_KEY=<new key>
 *   - Encrypted values are prefixed with `v<n>:` so the correct key can be
 *     selected at decrypt time.
 */

function getCurrentVersion(): number {
  return parseInt(process.env.FIELD_ENCRYPTION_KEY_VERSION ?? '1', 10);
}

function getCurrentKey(): Buffer {
  const hex = process.env.FIELD_ENCRYPTION_KEY ?? '';
  if (hex.length !== 64)
    throw new Error('FIELD_ENCRYPTION_KEY must be a 64-char hex string (32 bytes)');
  return Buffer.from(hex, 'hex');
}

function getKeyForVersion(version: number): Buffer {
  if (version === getCurrentVersion()) return getCurrentKey();

  const envVar = `FIELD_ENCRYPTION_KEY_V${version}`;
  const hex = process.env[envVar] ?? '';
  if (hex.length !== 64)
    throw new Error(`${envVar} must be a 64-char hex string (32 bytes) for key rotation`);
  return Buffer.from(hex, 'hex');
}

/**
 * Encrypts plaintext with the current key.
 * Returns `v<version>:iv:ciphertext:tag` as a colon-delimited hex string.
 */
export function encrypt(plaintext: string): string {
  const version = getCurrentVersion();
  const key = getCurrentKey();
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v${version}:${iv.toString('hex')}:${ct.toString('hex')}:${tag.toString('hex')}`;
}

/**
 * Decrypts a value produced by `encrypt`.
 * Accepts both the versioned `v<n>:iv:ct:tag` format and the legacy `iv:ct:tag` format.
 * Returns the input unchanged if it does not look like an encrypted value.
 */
export function decrypt(encoded: string): string {
  if (!encoded) return encoded;

  let version = getCurrentVersion();
  let rest = encoded;

  const versionMatch = encoded.match(/^v(\d+):/);
  if (versionMatch) {
    version = parseInt(versionMatch[1], 10);
    rest = encoded.slice(versionMatch[0].length);
  }

  const parts = rest.split(':');
  if (parts.length < 3) return encoded; // not encrypted — return as-is

  const [ivHex, ctHex, tagHex] = parts;
  const key = getKeyForVersion(version);
  const decipher = createDecipheriv(ALGO, key, Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  return decipher.update(Buffer.from(ctHex, 'hex')).toString('utf8') + decipher.final('utf8');
}
