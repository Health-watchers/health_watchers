/**
 * Document at-rest encryption — Issue #1247
 *
 * Envelope encryption: a fresh 256-bit data key is generated per document,
 * used with AES-256-GCM to encrypt the bytes, then itself wrapped with the
 * master key derived from config. Only the wrapped key + IV + auth tag are
 * persisted (on the document). Works with the local storage driver; the S3
 * driver additionally sets SSE.
 */
import crypto from 'crypto';
import { config } from '@health-watchers/config';
import type { DocumentEncryption } from './models/document.model';

const ALGO = 'aes-256-gcm' as const;

function masterKey(): Buffer {
  const raw = config.storage.documentEncryptionKey;
  if (!raw) {
    throw Object.assign(new Error('Document encryption key is not configured'), {
      code: 'ENCRYPTION_NOT_CONFIGURED',
    });
  }
  // Accept a hex/base64 32-byte key, or derive one deterministically via SHA-256.
  if (/^[0-9a-f]{64}$/i.test(raw)) return Buffer.from(raw, 'hex');
  const b64 = Buffer.from(raw, 'base64');
  if (b64.length === 32) return b64;
  return crypto.createHash('sha256').update(raw).digest();
}

export function isEncryptionConfigured(): boolean {
  return Boolean(config.storage.documentEncryptionKey);
}

export interface EncryptedPayload {
  ciphertext: Buffer;
  encryption: DocumentEncryption;
}

export function encryptBuffer(plaintext: Buffer): EncryptedPayload {
  const dataKey = crypto.randomBytes(32);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, dataKey, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();

  // Wrap the data key with the master key (AES-256-GCM, separate IV prepended).
  const wrapIv = crypto.randomBytes(12);
  const wrapCipher = crypto.createCipheriv(ALGO, masterKey(), wrapIv);
  const wrapped = Buffer.concat([wrapCipher.update(dataKey), wrapCipher.final()]);
  const wrapTag = wrapCipher.getAuthTag();

  return {
    ciphertext,
    encryption: {
      algorithm: ALGO,
      iv: iv.toString('base64'),
      authTag: authTag.toString('base64'),
      // wrappedKey layout: wrapIv(12) | wrapTag(16) | wrapped
      wrappedKey: Buffer.concat([wrapIv, wrapTag, wrapped]).toString('base64'),
    },
  };
}

export function decryptBuffer(ciphertext: Buffer, meta: DocumentEncryption): Buffer {
  const blob = Buffer.from(meta.wrappedKey, 'base64');
  const wrapIv = blob.subarray(0, 12);
  const wrapTag = blob.subarray(12, 28);
  const wrapped = blob.subarray(28);

  const unwrap = crypto.createDecipheriv(ALGO, masterKey(), wrapIv);
  unwrap.setAuthTag(wrapTag);
  const dataKey = Buffer.concat([unwrap.update(wrapped), unwrap.final()]);

  const decipher = crypto.createDecipheriv(ALGO, dataKey, Buffer.from(meta.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(meta.authTag, 'base64'));
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

export function sha256(buf: Buffer): string {
  return crypto.createHash('sha256').update(buf).digest('hex');
}
