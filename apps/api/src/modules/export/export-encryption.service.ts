/**
 * Export encryption and digital-signing service (Issue #1243).
 *
 * Encryption  – AES-256-GCM symmetric encryption using the same key-management
 *               infrastructure already in use for PHI field encryption
 *               (apps/api/src/lib/encrypt.ts).
 *
 * Signing     – HMAC-SHA256 over the raw payload with a dedicated EXPORT_SIGNING_KEY
 *               env var (falls back to FIELD_ENCRYPTION_KEY for local dev).
 *
 * Both functions are intentionally pure / synchronous so they can be used inside
 * scheduled-export jobs without blocking the event loop for small-to-medium
 * payloads. For payloads > 10 MB, consider streaming encryption.
 */

import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'crypto';

const ALGO = 'aes-256-gcm';
const IV_LEN = 12; // 96-bit IV recommended for GCM

// ─── Key resolution ──────────────────────────────────────────────────────────

function getEncryptionKey(): Buffer {
  const hex = process.env.FIELD_ENCRYPTION_KEY ?? '';
  if (hex.length !== 64) {
    throw new Error(
      'FIELD_ENCRYPTION_KEY must be a 64-char hex string (32 bytes). Set it in .env.'
    );
  }
  return Buffer.from(hex, 'hex');
}

function getSigningKey(): Buffer {
  const hex = process.env.EXPORT_SIGNING_KEY ?? process.env.FIELD_ENCRYPTION_KEY ?? '';
  if (hex.length !== 64) {
    throw new Error(
      'EXPORT_SIGNING_KEY (or FIELD_ENCRYPTION_KEY) must be a 64-char hex string.'
    );
  }
  return Buffer.from(hex, 'hex');
}

// ─── Encryption ──────────────────────────────────────────────────────────────

/**
 * Encrypt a UTF-8 string payload with AES-256-GCM.
 *
 * Returns a JSON envelope:
 * ```json
 * {
 *   "v": 1,
 *   "iv": "<hex>",
 *   "ct": "<hex>",
 *   "tag": "<hex>"
 * }
 * ```
 * The caller should base64-encode this for transport/storage.
 */
export function encryptExportData(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  const envelope = {
    v: 1,
    iv: iv.toString('hex'),
    ct: ct.toString('hex'),
    tag: tag.toString('hex'),
  };

  return Buffer.from(JSON.stringify(envelope)).toString('base64');
}

/**
 * Decrypt an envelope produced by `encryptExportData`.
 * Throws if the ciphertext has been tampered with (GCM authentication failure).
 */
export function decryptExportData(encoded: string): string {
  const json = Buffer.from(encoded, 'base64').toString('utf8');
  const envelope = JSON.parse(json) as { v: number; iv: string; ct: string; tag: string };

  const key = getEncryptionKey();
  const decipher = createDecipheriv(ALGO, key, Buffer.from(envelope.iv, 'hex'));
  decipher.setAuthTag(Buffer.from(envelope.tag, 'hex'));

  return (
    decipher.update(Buffer.from(envelope.ct, 'hex')).toString('utf8') +
    decipher.final('utf8')
  );
}

// ─── Signing ─────────────────────────────────────────────────────────────────

/**
 * Produce an HMAC-SHA256 signature over a payload string.
 * Returns the hex-encoded digest.
 *
 * Usage:
 * ```ts
 * const sig = signExportData(payload);
 * // attach sig to the export envelope
 * verifyExportSignature(payload, sig); // throws on mismatch
 * ```
 */
export function signExportData(payload: string): string {
  const key = getSigningKey();
  return createHmac('sha256', key).update(payload, 'utf8').digest('hex');
}

/**
 * Verify a signature produced by `signExportData`.
 * Uses constant-time comparison to prevent timing attacks.
 *
 * @throws {Error} if the signature does not match
 */
export function verifyExportSignature(payload: string, expectedSig: string): void {
  const key = getSigningKey();
  const actualSig = createHmac('sha256', key).update(payload, 'utf8').digest('hex');

  // Constant-time comparison
  const expected = Buffer.from(expectedSig, 'hex');
  const actual = Buffer.from(actualSig, 'hex');

  if (expected.length !== actual.length) {
    throw new Error('Export signature verification failed: signature length mismatch');
  }

  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= expected[i]! ^ actual[i]!;
  }

  if (diff !== 0) {
    throw new Error('Export signature verification failed: signature does not match');
  }
}

// ─── Combined envelope helper ─────────────────────────────────────────────────

export interface SecureExportEnvelope {
  /** Whether the payload field is AES-256-GCM encrypted (base64) or plain */
  encrypted: boolean;
  /** Whether a signature is present */
  signed: boolean;
  /** The payload: either plaintext JSON / CSV / HL7 or an encrypted base64 blob */
  payload: string;
  /** HMAC-SHA256 hex signature of the *original plaintext* payload (before encryption) */
  signature?: string;
  exportedAt: string;
}

/**
 * Build a secure export envelope, optionally encrypting and/or signing the payload.
 *
 * The signature is always computed over the **plaintext** before encryption so that
 * the recipient can verify integrity after decryption.
 */
export function buildSecureEnvelope(
  plaintext: string,
  options: { encrypt: boolean; sign: boolean }
): SecureExportEnvelope {
  const signature = options.sign ? signExportData(plaintext) : undefined;
  const payload = options.encrypt ? encryptExportData(plaintext) : plaintext;

  return {
    encrypted: options.encrypt,
    signed: options.sign,
    payload,
    ...(signature ? { signature } : {}),
    exportedAt: new Date().toISOString(),
  };
}
