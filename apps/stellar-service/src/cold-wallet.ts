import { Keypair, Transaction, TransactionBuilder } from '@stellar/stellar-sdk';
import crypto from 'crypto';
import logger from './logger.js';

/**
 * Cold wallet integration service for Stellar
 * Provides secure key storage, signing, key rotation, and audit logging
 */

export interface SecureKeyStore {
  keyId: string;
  publicKey: string;
  encryptedSecretKey: string;
  iv: string;
  salt: string;
  algorithm: string;
  createdAt: string;
  rotatedAt: string;
  isActive: boolean;
  metadata?: Record<string, unknown>;
}

export interface SigningRequest {
  requestId: string;
  keyId: string;
  transactionXdr: string;
  requester: string;
  timestamp: string;
  signatureRequired: boolean;
}

export interface SigningResponse {
  requestId: string;
  keyId: string;
  signature: string;
  signedTransactionXdr?: string;
  timestamp: string;
  success: boolean;
  error?: string;
}

export interface KeyRotationEvent {
  eventId: string;
  oldKeyId: string;
  newKeyId: string;
  timestamp: string;
  reason: string;
  rotatedBy: string;
  status: 'pending' | 'completed' | 'failed';
  error?: string;
}

export interface AuditLog {
  eventId: string;
  eventType:
    | 'key_creation'
    | 'key_rotation'
    | 'signing_request'
    | 'key_retrieval'
    | 'encryption_change'
    | 'access_denied';
  keyId: string;
  timestamp: string;
  actor: string;
  action: string;
  result: 'success' | 'failure';
  details?: Record<string, unknown>;
  error?: string;
}

// In-memory storage (in production, use encrypted database)
const keyStore = new Map<string, SecureKeyStore>();
const auditLogs: AuditLog[] = [];
const rotationEvents: KeyRotationEvent[] = [];

// Encryption configuration
const ENCRYPTION_ALGORITHM = 'aes-256-cbc';
const ENCRYPTION_KEY_LENGTH = 32; // 256 bits

/**
 * Derive encryption key from password using PBKDF2
 */
function deriveEncryptionKey(password: string, salt: Buffer): Buffer {
  return crypto.pbkdf2Sync(password, salt, 100000, ENCRYPTION_KEY_LENGTH, 'sha256');
}

/**
 * Encrypt a secret key
 */
export function encryptSecretKey(
  secretKey: string,
  encryptionPassword: string
): { encrypted: string; iv: string; salt: string } {
  try {
    const salt = crypto.randomBytes(16);
    const iv = crypto.randomBytes(16);
    const encryptionKey = deriveEncryptionKey(encryptionPassword, salt);

    const cipher = crypto.createCipheriv(ENCRYPTION_ALGORITHM, encryptionKey, iv);
    let encrypted = cipher.update(secretKey, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    logger.debug({ algorithm: ENCRYPTION_ALGORITHM }, 'Secret key encrypted successfully');

    return {
      encrypted,
      iv: iv.toString('hex'),
      salt: salt.toString('hex'),
    };
  } catch (error: any) {
    logger.error({ error: error.message }, 'Failed to encrypt secret key');
    throw new Error('Encryption failed');
  }
}

/**
 * Decrypt a secret key
 */
export function decryptSecretKey(
  encryptedKey: string,
  encryptionPassword: string,
  salt: string,
  iv: string
): string {
  try {
    const saltBuffer = Buffer.from(salt, 'hex');
    const ivBuffer = Buffer.from(iv, 'hex');
    const encryptionKey = deriveEncryptionKey(encryptionPassword, saltBuffer);

    const decipher = crypto.createDecipheriv(ENCRYPTION_ALGORITHM, encryptionKey, ivBuffer);
    let decrypted = decipher.update(encryptedKey, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    logger.debug({ algorithm: ENCRYPTION_ALGORITHM }, 'Secret key decrypted successfully');

    return decrypted;
  } catch (error: any) {
    logger.error({ error: error.message }, 'Failed to decrypt secret key');
    throw new Error('Decryption failed');
  }
}

/**
 * Store an encrypted keypair
 */
export function storeKeyPair(
  keypair: Keypair,
  encryptionPassword: string,
  metadata?: Record<string, unknown>
): SecureKeyStore {
  const keyId = `key-${crypto.randomUUID()}`;
  const secretKey = keypair.secret();

  const { encrypted, iv, salt } = encryptSecretKey(secretKey, encryptionPassword);

  const store: SecureKeyStore = {
    keyId,
    publicKey: keypair.publicKey(),
    encryptedSecretKey: encrypted,
    iv,
    salt,
    algorithm: ENCRYPTION_ALGORITHM,
    createdAt: new Date().toISOString(),
    rotatedAt: new Date().toISOString(),
    isActive: true,
    metadata,
  };

  keyStore.set(keyId, store);

  logAuditEvent({
    eventType: 'key_creation',
    keyId,
    actor: 'system',
    action: 'Created and encrypted new keypair',
    result: 'success',
    details: { publicKey: keypair.publicKey() },
  });

  logger.info({ keyId, publicKey: keypair.publicKey() }, 'Keypair stored securely');

  return store;
}

/**
 * Retrieve a stored keypair for signing
 */
export function retrieveKeyPair(
  keyId: string,
  encryptionPassword: string,
  actor: string = 'unknown'
): Keypair {
  const store = keyStore.get(keyId);

  if (!store) {
    logAuditEvent({
      eventType: 'key_retrieval',
      keyId,
      actor,
      action: `Attempted to retrieve non-existent key`,
      result: 'failure',
      error: 'Key not found',
    });
    throw new Error('Key not found');
  }

  if (!store.isActive) {
    logAuditEvent({
      eventType: 'access_denied',
      keyId,
      actor,
      action: 'Attempted to use inactive key',
      result: 'failure',
      error: 'Key is inactive',
    });
    throw new Error('Key is inactive');
  }

  try {
    const decryptedSecret = decryptSecretKey(
      store.encryptedSecretKey,
      encryptionPassword,
      store.salt,
      store.iv
    );

    const keypair = Keypair.fromSecret(decryptedSecret);

    logAuditEvent({
      eventType: 'key_retrieval',
      keyId,
      actor,
      action: 'Successfully retrieved and decrypted keypair',
      result: 'success',
    });

    logger.debug({ keyId, publicKey: keypair.publicKey() }, 'Keypair retrieved');

    return keypair;
  } catch (error: any) {
    logAuditEvent({
      eventType: 'key_retrieval',
      keyId,
      actor,
      action: 'Failed to retrieve and decrypt keypair',
      result: 'failure',
      error: error.message,
    });
    throw error;
  }
}

/**
 * Sign a transaction using a stored key
 */
export function signTransaction(
  request: Omit<SigningRequest, 'requestId' | 'timestamp'>
): SigningResponse {
  const requestId = `sig-${crypto.randomUUID()}`;
  const timestamp = new Date().toISOString();

  try {
    const keypair = retrieveKeyPair(request.keyId, '', request.requester);

    // Deserialize and sign the transaction
    const transaction = new Transaction(
      request.transactionXdr,
      'Test SDF Network ; September 2015'
    );
    transaction.sign(keypair);

    const signedXdr = transaction.toEnvelope().toXDR('base64');
    const signature = transaction.hash().toString('hex');

    const response: SigningResponse = {
      requestId,
      keyId: request.keyId,
      signature,
      signedTransactionXdr: signedXdr,
      timestamp,
      success: true,
    };

    logAuditEvent({
      eventType: 'signing_request',
      keyId: request.keyId,
      actor: request.requester,
      action: 'Signed transaction',
      result: 'success',
      details: { requestId, signature },
    });

    logger.info({ requestId, keyId: request.keyId, signature }, 'Transaction signed successfully');

    return response;
  } catch (error: any) {
    const response: SigningResponse = {
      requestId,
      keyId: request.keyId,
      signature: '',
      timestamp,
      success: false,
      error: error.message,
    };

    logAuditEvent({
      eventType: 'signing_request',
      keyId: request.keyId,
      actor: request.requester,
      action: 'Failed to sign transaction',
      result: 'failure',
      error: error.message,
      details: { requestId },
    });

    logger.error(
      { requestId, keyId: request.keyId, error: error.message },
      'Transaction signing failed'
    );

    return response;
  }
}

/**
 * Rotate a key (deactivate old, create new)
 */
export function rotateKey(
  oldKeyId: string,
  encryptionPassword: string,
  reason: string,
  actor: string
): { oldKey: SecureKeyStore; newKey: SecureKeyStore; rotationEvent: KeyRotationEvent } {
  const eventId = `rotation-${crypto.randomUUID()}`;
  const timestamp = new Date().toISOString();

  try {
    // Get the old key
    const oldStore = keyStore.get(oldKeyId);
    if (!oldStore) {
      throw new Error('Old key not found');
    }

    // Generate new keypair with same public key (in production, might rotate to different key)
    const keypair = retrieveKeyPair(oldKeyId, encryptionPassword, actor);
    const newStore = storeKeyPair(keypair, encryptionPassword, {
      ...oldStore.metadata,
      rotatedFrom: oldKeyId,
    });

    // Deactivate old key
    oldStore.isActive = false;

    // Record rotation event
    const rotationEvent: KeyRotationEvent = {
      eventId,
      oldKeyId,
      newKeyId: newStore.keyId,
      timestamp,
      reason,
      rotatedBy: actor,
      status: 'completed',
    };

    rotationEvents.push(rotationEvent);
    if (rotationEvents.length > 1000) {
      rotationEvents.shift();
    }

    logAuditEvent({
      eventType: 'key_rotation',
      keyId: oldKeyId,
      actor,
      action: `Rotated key from ${oldKeyId} to ${newStore.keyId}`,
      result: 'success',
      details: { newKeyId: newStore.keyId, reason, eventId },
    });

    logger.info({ oldKeyId, newKeyId: newStore.keyId, eventId, reason }, 'Key rotation completed');

    return { oldKey: oldStore, newKey: newStore, rotationEvent };
  } catch (error: any) {
    const rotationEvent: KeyRotationEvent = {
      eventId,
      oldKeyId,
      newKeyId: '',
      timestamp,
      reason,
      rotatedBy: actor,
      status: 'failed',
      error: error.message,
    };

    rotationEvents.push(rotationEvent);

    logAuditEvent({
      eventType: 'key_rotation',
      keyId: oldKeyId,
      actor,
      action: `Failed to rotate key`,
      result: 'failure',
      error: error.message,
      details: { reason, eventId },
    });

    logger.error({ oldKeyId, error: error.message, eventId }, 'Key rotation failed');

    throw error;
  }
}

/**
 * Log an audit event
 */
export function logAuditEvent(event: Omit<AuditLog, 'eventId' | 'timestamp'>): AuditLog {
  const auditEvent: AuditLog = {
    ...event,
    eventId: `audit-${crypto.randomUUID()}`,
    timestamp: new Date().toISOString(),
  };

  auditLogs.push(auditEvent);

  // Keep only last 10000 logs in memory
  if (auditLogs.length > 10000) {
    auditLogs.splice(0, auditLogs.length - 10000);
  }

  logger.debug(
    { eventId: auditEvent.eventId, eventType: auditEvent.eventType, actor: auditEvent.actor },
    'Audit event logged'
  );

  return auditEvent;
}

/**
 * Get audit logs with filtering
 */
export function getAuditLogs(filter?: {
  keyId?: string;
  eventType?: string;
  actor?: string;
  limit?: number;
}): AuditLog[] {
  let logs = [...auditLogs];

  if (filter?.keyId) {
    logs = logs.filter((l) => l.keyId === filter.keyId);
  }

  if (filter?.eventType) {
    logs = logs.filter((l) => l.eventType === filter.eventType);
  }

  if (filter?.actor) {
    logs = logs.filter((l) => l.actor === filter.actor);
  }

  const limit = filter?.limit ?? 100;
  return logs.slice(-limit);
}

/**
 * Get key rotation events
 */
export function getRotationHistory(limit: number = 50): KeyRotationEvent[] {
  return rotationEvents.slice(-limit);
}

/**
 * Get all stored key IDs
 */
export function getStoredKeyIds(): string[] {
  return Array.from(keyStore.keys());
}

/**
 * Get key metadata
 */
export function getKeyMetadata(
  keyId: string
): Omit<SecureKeyStore, 'encryptedSecretKey' | 'iv' | 'salt'> | null {
  const store = keyStore.get(keyId);
  if (!store) {
    return null;
  }

  const { encryptedSecretKey, iv, salt, ...metadata } = store;
  return metadata;
}

/**
 * Deactivate a key
 */
export function deactivateKey(keyId: string, actor: string): boolean {
  const store = keyStore.get(keyId);

  if (!store) {
    logAuditEvent({
      eventType: 'access_denied',
      keyId,
      actor,
      action: 'Attempted to deactivate non-existent key',
      result: 'failure',
    });
    return false;
  }

  store.isActive = false;

  logAuditEvent({
    eventType: 'key_retrieval',
    keyId,
    actor,
    action: 'Deactivated key',
    result: 'success',
  });

  logger.info({ keyId, actor }, 'Key deactivated');

  return true;
}

/**
 * Clear all stored keys (for testing only)
 */
export function clearAllKeys(): void {
  keyStore.clear();
  auditLogs.length = 0;
  rotationEvents.length = 0;
  logger.warn('All cold wallet keys and logs cleared');
}

/**
 * Get statistics
 */
export function getColdWalletStatistics(): {
  totalKeys: number;
  activeKeys: number;
  totalSigningRequests: number;
  totalRotations: number;
  auditLogSize: number;
} {
  const activeKeys = Array.from(keyStore.values()).filter((k) => k.isActive).length;
  const totalSigningRequests = auditLogs.filter((l) => l.eventType === 'signing_request').length;
  const totalRotations = rotationEvents.length;

  return {
    totalKeys: keyStore.size,
    activeKeys,
    totalSigningRequests,
    totalRotations,
    auditLogSize: auditLogs.length,
  };
}
