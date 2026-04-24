import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import { Keypair } from '@stellar/stellar-sdk';

const ALGO = 'aes-256-gcm';
const IV_LEN = 16;

function getEncryptionKey() {
  const hex = process.env.KEYPAIR_ENCRYPTION_KEY || '';
  if (hex.length !== 64) {
    throw new Error('KEYPAIR_ENCRYPTION_KEY must be a 64-char hex string (32 bytes)');
  }
  return Buffer.from(hex, 'hex');
}

export interface EncryptedKeypair {
  encryptedSecretKey: string; // hex: ciphertext:authTag
  iv: string;                 // hex
}

/** Encrypt a Stellar secret key with AES-256-GCM. Returns ciphertext+tag and IV separately. */
export function encryptSecretKey(secretKey: string) {
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, getEncryptionKey(), iv);
  const ct = Buffer.concat([cipher.update(secretKey, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    encryptedSecretKey: `${ct.toString('hex')}:${tag.toString('hex')}`,
    iv: iv.toString('hex'),
  };
}

/** Decrypt a Stellar secret key. Never log the return value. */
export function decryptSecretKey(encryptedSecretKey: string, iv: string) {
  const [ctHex, tagHex] = encryptedSecretKey.split(':');
  if (!ctHex || !tagHex) throw new Error('Invalid encrypted secret key format');
  const decipher = createDecipheriv(ALGO, getEncryptionKey(), Buffer.from(iv, 'hex'));
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  return decipher.update(Buffer.from(ctHex, 'hex')).toString('utf8') + decipher.final('utf8');
}

/** Generate a new Stellar keypair and return the public key + encrypted secret. */
export function generateClinicKeypair() {
  const keypair = Keypair.random();
  const publicKey = keypair.publicKey();
  const encrypted = encryptSecretKey(keypair.secret());
  return { publicKey, ...encrypted };
}
