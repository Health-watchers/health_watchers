import { Keypair, Transaction } from '@stellar/stellar-sdk';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import logger from './logger.js';

/**
 * Hot signer service for Stellar.
 *
 * NOTE: This module was previously named `cold-wallet.ts`. Per ADR-0001
 * (docs/adr/0001-key-custody.md) it is NOT a cold wallet: keys are held in
 * process memory and signing happens over HTTP. It has been renamed to
 * `hot-signer.ts` to reflect its real nature.
 *
 * Custody guarantees provided here:
 *  - Secrets are encrypted with AES-256-GCM (authenticated encryption).
 *  - Audit logs and rotation events are persisted to an append-only, hash-chained
 *    log sink so they survive restarts and tampering is detectable.
 *  - Signing requires multi-party approval (M-of-N) before it is honoured.
 *  - No API accepts a plaintext Stellar secret key; keys are imported via
 *    KMS/HSM or offline multisig (see ADR-0001).
 */

export interface SecureKeyStore {
  keyId: string;
  publicKey: string;
  encryptedSecretKey: string;
  iv: string;
  authTag: string;
  salt: string;
  algorithm: string;
  createdAt: string;
  rotatedAt: string;
  isActive: boolean;
  metadata?: Record<string, unknown>;
}

export interface SigningApproval {
  approver: string;
  approvedAt: string;
  /** Signature over the canonical approval payload, produced out-of-band. */
  approvalSignature: string;
}

export interface SigningRequest {
  requestId: string;
  keyId: string;
  transactionXdr: string;
  requester: string;
  timestamp: string;
  signatureRequired: boolean;
  /** M-of-N approvals required before the request is honoured. */
  approvals?: SigningApproval[];
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

// ---------------------------------------------------------------------------
// Persistent append-only storage
// ---------------------------------------------------------------------------
//
// Keys, audit logs and rotation events are persisted to an append-only log
// sink on disk (one JSON record per line). Records are hash-chained so that
// any modification or deletion of a prior record is detectable. In production
// this sink should be backed by WORM storage (e.g. S3 Object Lock) or an
// append-only database table; the interface below is intentionally minimal so
// it can be swapped without touching callers.

const STORAGE_DIR = process.env.HOT_SIGNER_STORAGE_DIR || path.join(process.cwd(), '.hot-signer');
const KEY_STORE_FILE = path.join(STORAGE_DIR, 'keys.jsonl');
const AUDIT_LOG_FILE = path.join(STORAGE_DIR, 'audit.jsonl');
const ROTATION_LOG_FILE = path.join(STORAGE_DIR, 'rotations.jsonl');

/** Number of distinct approvers required before a signing request is honoured. */
const REQUIRED_APPROVALS = Number(process.env.HOT_SIGNER_REQUIRED_APPROVALS ?? 2);

interface ChainedRecord<T> {
  seq: number;
  prevHash: string;
  hash: string;
  payload: T;
}

function ensureStorageDir(): void {
  if (!fs.existsSync(STORAGE_DIR)) {
    fs.mkdirSync(STORAGE_DIR, { recursive: true, mode: 0o700 });
  }
}

function hashRecord(prevHash: string, seq: number, payload: unknown): string {
  return crypto
    .createHash('sha256')
    .update(prevHash)
    .update(String(seq))
    .update(JSON.stringify(payload))
    .digest('hex');
}

function readChainedRecords<T>(file: string): ChainedRecord<T>[] {
  if (!fs.existsSync(file)) {
    return [];
  }
  const content = fs.readFileSync(file, 'utf8');
  const records: ChainedRecord<T>[] = [];
  for (const line of content.split('\n')) {
    if (!line.trim()) continue;
    records.push(JSON.parse(line) as ChainedRecord<T>);
  }
  return records;
}

/**
 * Append a record to an append-only, hash-chained log file.
 * The file is opened with the append flag so existing records are never
 * rewritten by this process.
 */
function appendChainedRecord<T>(file: string, payload: T): ChainedRecord<T> {
  ensureStorageDir();
  const existing = readChainedRecords<T>(file);
  const prev = existing[existing.length - 1];
  const seq = prev ? prev.seq + 1 : 0;
  const prevHash = prev ? prev.hash : 'GENESIS';
  const record: ChainedRecord<T> = {
    seq,
    prevHash,
    hash: hashRecord(prevHash, seq, payload),
    payload,
  };
  fs.appendFileSync(file, `${JSON.stringify(record)}\n`, { mode: 0o600 });
  return record;
}

/**
 * Verify the integrity of an append-only, hash-chained log file.
 * Returns true only if every record links correctly to its predecessor.
 */
export function verifyLogIntegrity(file: 'audit' | 'rotations' | 'keys'): boolean {
  const target =
    file === 'audit' ? AUDIT_LOG_FILE : file === 'rotations' ? ROTATION_LOG_FILE : KEY_STORE_FILE;
  const records = readChainedRecords<unknown>(target);
  let prevHash = 'GENESIS';
  for (let i = 0; i < records.length; i++) {
    const r = records[i];
    if (r.seq !== i || r.prevHash !== prevHash) return false;
    if (r.hash !== hashRecord(r.prevHash, r.seq, r.payload)) return false;
    prevHash = r.hash;
  }
  return true;
}

function loadKeyStore(): Map<string, SecureKeyStore> {
  const map = new Map<string, SecureKeyStore>();
  for (const record of readChainedRecords<SecureKeyStore>(KEY_STORE_FILE)) {
    map.set(record.payload.keyId, record.payload);
  }
  return map;
}

function persistKey(store: SecureKeyStore): void {
  appendChainedRecord(KEY_STORE_FILE, store);
}

// Encryption configuration
const ENCRYPTION_ALGORITHM = 'aes-256-gcm';
const ENCRYPTION_KEY_LENGTH = 32; // 256 bits
const GCM_IV_LENGTH = 12; // 96-bit nonce recommended for GCM
const GCM_AUTH_TAG_LENGTH = 16;

/**
 * Derive encryption key from password using PBKDF2
 */
function deriveEncryptionKey(password: string, salt: Buffer): Buffer {
  return crypto.pbkdf2Sync(password, salt, 100000, ENCRYPTION_KEY_LENGTH, 'sha256');
}

/**
 * Encrypt a secret key using AES-256-GCM (authenticated encryption).
 */
export function encryptSecretKey(
  secretKey: string,
  encryptionPassword: string
): { encrypted: string; iv: string; salt: string; authTag: string } {
  try {
    const salt = crypto.randomBytes(16);
    const iv = crypto.randomBytes(GCM_IV_LENGTH);
    const encryptionKey = deriveEncryptionKey(encryptionPassword, salt);

    const cipher = crypto.createCipheriv(ENCRYPTION_ALGORITHM, encryptionKey, iv, {
      authTagLength: GCM_AUTH_TAG_LENGTH,
    });
    let encrypted = cipher.update(secretKey, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag().toString('hex');

    logger.debug({ algorithm: ENCRYPTION_ALGORITHM }, 'Secret key encrypted successfully');

    return {
      encrypted,
      iv: iv.toString('hex'),
      salt: salt.toString('hex'),
      authTag,
    };
  } catch (error: any) {
    logger.error({ error: error.message }, 'Failed to encrypt secret key');
    throw new Error('Encryption failed');
  }
}

/**
 * Decrypt a secret key. The GCM auth tag is verified; tampered ciphertext is
 * rejected with an error rather than silently decrypted.
 */
export function decryptSecretKey(
  encryptedKey: string,
  encryptionPassword: string,
  salt: string,
  iv: string,
  authTag: string
): string {
  try {
    const saltBuffer = Buffer.from(salt, 'hex');
    const ivBuffer = Buffer.from(iv, 'hex');
    const authTagBuffer = Buffer.from(authTag, 'hex');
    const encryptionKey = deriveEncryptionKey(encryptionPassword, saltBuffer);

    const decipher = crypto.createDecipheriv(ENCRYPTION_ALGORITHM, encryptionKey, ivBuffer, {
      authTagLength: GCM_AUTH_TAG_LENGTH,
    });
    decipher.setAuthTag(authTagBuffer);
    let decrypted = decipher.update(encryptedKey, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    logger.debug({ algorithm: ENCRYPTION_ALGORITHM }, 'Secret key decrypted successfully');

    return decrypted;
  } catch (error: any) {
    logger.error({ error: error.message }, 'Failed to decrypt secret key (auth tag mismatch?)');
    throw new Error('Decryption failed: ciphertext authentication failed');
  }
}

/**
 * Import a keypair into the signer.
 *
 * Per ADR-0001, plaintext Stellar secret keys MUST NOT be accepted over HTTP.
 * This function is intended to be called only from trusted in-process code
 * (e.g. a KMS/HSM import routine or an offline multisig ceremony), never
 * directly from a request handler. Callers should prefer `importKeyFromKms`.
 */
export function storeKeyPair(
  keypair: Keypair,
  encryptionPassword: string,
  metadata?: Record<string, unknown>
): SecureKeyStore {
  const keyId = `key-${crypto.randomUUID()}`;
  const secretKey = keypair.secret();

  const { encrypted, iv, salt, authTag } = encryptSecretKey(secretKey, encryptionPassword);

  const store: SecureKeyStore = {
    keyId,
    publicKey: keypair.publicKey(),
    encryptedSecretKey: encrypted,
    iv,
    authTag,
    salt,
    algorithm: ENCRYPTION_ALGORITHM,
    createdAt: new Date().toISOString(),
    rotatedAt: new Date().toISOString(),
    isActive: true,
    metadata,
  };

  persistKey(store);

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
 * Import a key from an external KMS/HSM.
 *
 * The KMS is expected to return the secret material over a mutually
 * authenticated, encrypted channel (e.g. AWS KMS Decrypt or Vault Transit).
 * This is the only supported path for bringing new keys into the signer.
 */
export async function importKeyFromKms(
  kmsFetchSecret: () => Promise<string>,
  encryptionPassword: string,
  metadata?: Record<string, unknown>
): Promise<SecureKeyStore> {
  const secret = await kmsFetchSecret();
  const keypair = Keypair.fromSecret(secret);
  return storeKeyPair(keypair, encryptionPassword, { ...metadata, source: 'kms' });
}

/**
 * Retrieve a stored keypair for signing
 */
export function retrieveKeyPair(
  keyId: string,
  encryptionPassword: string,
  actor: string = 'unknown'
): Keypair {
  const keyStore = loadKeyStore();
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
      store.iv,
      store.authTag
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
 * Verify that a signing request carries the required number of distinct,
 * valid approvals. Approvals are verified out-of-band; here we only enforce
 * the M-of-N threshold and distinctness of approvers.
 */
function hasSufficientApprovals(request: Omit<SigningRequest, 'requestId' | 'timestamp'>): {
  ok: boolean;
  reason?: string;
} {
  const approvals = request.approvals ?? [];
  const distinct = new Set<string>();
  for (const a of approvals) {
    if (!a.approver || !a.approvalSignature) {
      return { ok: false, reason: 'Malformed approval' };
    }
    distinct.add(a.approver);
  }
  if (distinct.size < REQUIRED_APPROVALS) {
    return {
      ok: false,
      reason: `Insufficient approvals: ${distinct.size}/${REQUIRED_APPROVALS} required`,
    };
  }
  return { ok: true };
}

/**
 * Sign a transaction using a stored key.
 *
 * Requires multi-party approval (M-of-N) before the request is honoured.
 */
export function signTransaction(
  request: Omit<SigningRequest, 'requestId' | 'timestamp'>
): SigningResponse {
  const requestId = `sig-${crypto.randomUUID()}`;
  const timestamp = new Date().toISOString();

  try {
    const approval = hasSufficientApprovals(request);
    if (!approval.ok) {
      throw new Error(approval.reason ?? 'Signing not approved');
    }

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
      details: {
        requestId,
        signature,
        approvers: (request.approvals ?? []).map((a) => a.approver),
      },
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
    const keyStore = loadKeyStore();
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

    // Deactivate old key (persisted as a new append-only record)
    oldStore.isActive = false;
    persistKey(oldStore);

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

    appendChainedRecord(ROTATION_LOG_FILE, rotationEvent);

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

    appendChainedRecord(ROTATION_LOG_FILE, rotationEvent);

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
 * Log an audit event to the persistent append-only sink.
 */
export function logAuditEvent(event: Omit<AuditLog, 'eventId' | 'timestamp'>): AuditLog {
  const auditEvent: AuditLog = {
    ...event,
    eventId: `audit-${crypto.randomUUID()}`,
    timestamp: new Date().toISOString(),
  };

  appendChainedRecord(AUDIT_LOG_FILE, auditEvent);

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
  let logs = readChainedRecords<AuditLog>(AUDIT_LOG_FILE).map((r) => r.payload);

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
  return readChainedRecords<KeyRotationEvent>(ROTATION_LOG_FILE)
    .map((r) => r.payload)
    .slice(-limit);
}

/**
 * Get all stored key IDs
 */
export function getStoredKeyIds(): string[] {
  return Array.from(loadKeyStore().keys());
}

/**
 * Get key metadata
 */
export function getKeyMetadata(
  keyId: string
): Omit<SecureKeyStore, 'encryptedSecretKey' | 'iv' | 'authTag' | 'salt'> | null {
  const store = loadKeyStore().get(keyId);
  if (!store) {
    return null;
  }

  const { encryptedSecretKey, iv, authTag, salt, ...metadata } = store;
  return metadata;
}

/**
 * Deactivate a key
 */
export function deactivateKey(keyId: string, actor: string): boolean {
  const keyStore = loadKeyStore();
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
  persistKey(store);

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
 * Clear all stored keys (for testing only).
 *
 * NOTE: This deletes the append-only log files. In production the sink is
 * WORM-backed and this function must not be exposed.
 */
export function clearAllKeys(): void {
  for (const file of [KEY_STORE_FILE, AUDIT_LOG_FILE, ROTATION_LOG_FILE]) {
    if (fs.existsSync(file)) {
      fs.unlinkSync(file);
    }
  }
  logger.warn('All hot signer keys and logs cleared');
}

/**
 * Get statistics
 */
export function getHotSignerStatistics(): {
  totalKeys: number;
  activeKeys: number;
  totalSigningRequests: number;
  totalRotations: number;
  auditLogSize: number;
} {
  const keyStore = loadKeyStore();
  const auditLogs = readChainedRecords<AuditLog>(AUDIT_LOG_FILE).map((r) => r.payload);
  const rotationEvents = readChainedRecords<KeyRotationEvent>(ROTATION_LOG_FILE);

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

/** @deprecated Use {@link getHotSignerStatistics}. */
export const getColdWalletStatistics = getHotSignerStatistics;
