import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import { Keypair } from '@stellar/stellar-sdk';
import { mongodbKeyDecryptionFailures } from '@api/services/metrics.service';

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
  try {
    const decipher = createDecipheriv(ALGO, getEncryptionKey(), Buffer.from(iv, 'hex'));
    decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
    return decipher.update(Buffer.from(ctHex, 'hex')).toString('utf8') + decipher.final('utf8');
  } catch (err) {
    mongodbKeyDecryptionFailures.inc();
    throw err;
  }
}

/** Generate a new Stellar keypair and return the public key + encrypted secret. */
export function generateClinicKeypair() {
  const keypair = Keypair.random();
  const publicKey = keypair.publicKey();
  const encrypted = encryptSecretKey(keypair.secret());
  return { publicKey, ...encrypted };
}

export interface RotateKeypairResult {
  publicKey: string;
  keyVersion: number;
  transferResult?: { transferred: boolean; amount?: string; hash?: string };
}

export interface RotateKeypairDeps {
  ClinicModel: {
    findById: (id: any) => Promise<any>;
    findByIdAndUpdate: (id: any, update: any) => Promise<any>;
  };
  ClinicKeypairModel: {
    findOne: (filter: any) => { sort: (s: any) => { lean: () => Promise<any> } };
    create: (doc: any) => Promise<any>;
    findByIdAndUpdate: (id: any, update: any) => Promise<any>;
    findByIdAndDelete: (id: any) => Promise<any>;
    updateMany: (filter: any, update: any) => Promise<any>;
  };
  stellarClient: {
    transferBalance: (from: string, to: string) => Promise<any>;
    fundAccount: (publicKey: string) => Promise<any>;
  };
  stellarNetwork: string;
  logger: { warn: (...args: any[]) => void; error: (...args: any[]) => void };
}

/**
 * Atomically rotate a clinic's Stellar keypair.
 *
 * Steps:
 *  1. Generate new keypair and persist it (inactive).
 *  2. Fund the new account on testnet (if applicable).
 *  3. Transfer balance from old account to new account.
 *  4. Activate new keypair and update clinic record.
 *  5. Deactivate old keypair(s).
 *
 * Rollback: if balance transfer fails, the new keypair document is deleted
 * and the clinic record is left unchanged.
 */
export async function rotateClinicKeypair(
  clinicId: string,
  deps: RotateKeypairDeps,
): Promise<RotateKeypairResult> {
  const { ClinicModel, ClinicKeypairModel, stellarClient, stellarNetwork, logger } = deps;

  const clinic = await ClinicModel.findById(clinicId);
  if (!clinic) throw new Error('Clinic not found');

  const oldPublicKey = clinic.stellarPublicKey;

  // Determine next key version
  const lastKeypair = await ClinicKeypairModel.findOne({ clinicId })
    .sort({ keyVersion: -1 })
    .lean();
  const nextVersion = (lastKeypair?.keyVersion ?? 0) + 1;

  // Step 1: Generate and persist new keypair (inactive until transfer succeeds)
  const { publicKey: newPublicKey, encryptedSecretKey, iv } = generateClinicKeypair();
  const newKeypairDoc = await ClinicKeypairModel.create({
    clinicId,
    publicKey: newPublicKey,
    encryptedSecretKey,
    iv,
    keyVersion: nextVersion,
    isActive: false,
  });

  try {
    // Step 2: Fund new account on testnet (best-effort)
    if (stellarNetwork === 'testnet') {
      await stellarClient.fundAccount(newPublicKey).catch((err: unknown) =>
        logger.warn({ err, newPublicKey }, 'Friendbot funding failed for rotated keypair'),
      );
    }

    // Step 3: Transfer balance from old account to new account (must succeed)
    let transferResult: RotateKeypairResult['transferResult'];
    if (oldPublicKey && oldPublicKey !== newPublicKey) {
      transferResult = await stellarClient.transferBalance(oldPublicKey, newPublicKey);
    }

    // Step 4: Activate new keypair and update clinic record
    await ClinicKeypairModel.findByIdAndUpdate(newKeypairDoc._id, { isActive: true });
    await ClinicModel.findByIdAndUpdate(clinicId, { stellarPublicKey: newPublicKey });

    // Step 5: Deactivate old keypair(s)
    await ClinicKeypairModel.updateMany(
      { clinicId, isActive: true, _id: { $ne: newKeypairDoc._id } },
      { isActive: false },
    );

    return { publicKey: newPublicKey, keyVersion: nextVersion, transferResult };
  } catch (err) {
    // Rollback: remove the new (inactive) keypair document
    await ClinicKeypairModel.findByIdAndDelete(newKeypairDoc._id).catch((rollbackErr: unknown) =>
      logger.error({ rollbackErr }, 'Failed to rollback new keypair document during rotation'),
    );
    throw err;
  }
}

