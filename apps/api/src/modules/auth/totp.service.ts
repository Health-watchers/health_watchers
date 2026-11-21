import { authenticator } from 'otplib';
import QRCode from 'qrcode';
import crypto from 'crypto';
import { auditService } from './audit.service';

export interface BackupCode {
  hash: string;
  used: boolean;
  usedAt?: Date;
}

export interface GeneratedBackupCodes {
  plaintext: string[];
  hashed: BackupCode[];
}

export interface VerifyOrRecoverResult {
  success: boolean;
  method?: 'totp' | 'backup_code';
  remainingBackupCodes?: BackupCode[];
}

const BACKUP_CODE_COUNT = 10;
const BACKUP_CODE_LENGTH = 10;

function hashBackupCode(code: string): string {
  return crypto.createHash('sha256').update(code).digest('hex');
}

function normalizeBackupCode(code: string): string {
  return code.replace(/[\s-]/g, '').toUpperCase();
}

export const totpService = {
  async setup(
    email: string
  ): Promise<{ secret: string; otpauthUrl: string; qrCodeDataUrl: string }> {
    const secret = authenticator.generateSecret();
    const otpauthUrl = authenticator.keyuri(email, 'Health Watchers', secret);
    const qrCodeDataUrl = await QRCode.toDataURL(otpauthUrl);
    return { secret, otpauthUrl, qrCodeDataUrl };
  },

  verify(token: string, secret: string): boolean {
    return authenticator.verify({ token, secret });
  },

  /**
   * Generate a fresh set of single-use backup codes.
   * Returns the plaintext codes (to show the user once) and the hashed
   * representations (to persist). Plaintext codes are never stored.
   */
  generateBackupCodes(count: number = BACKUP_CODE_COUNT): GeneratedBackupCodes {
    const plaintext: string[] = [];
    const hashed: BackupCode[] = [];

    for (let i = 0; i < count; i++) {
      const raw = crypto
        .randomBytes(BACKUP_CODE_LENGTH)
        .toString('base64')
        .replace(/[^A-Za-z0-9]/g, '')
        .toUpperCase()
        .slice(0, BACKUP_CODE_LENGTH);
      const code = `${raw.slice(0, 5)}-${raw.slice(5)}`;
      plaintext.push(code);
      hashed.push({ hash: hashBackupCode(normalizeBackupCode(code)), used: false });
    }

    return { plaintext, hashed };
  },

  /**
   * Verify a backup code against the stored hashed codes. On success the
   * matching code is marked as used (consumed) and the updated list is
   * returned so the caller can persist it.
   */
  verifyBackupCode(
    code: string,
    storedCodes: BackupCode[]
  ): { valid: boolean; updatedCodes: BackupCode[] } {
    const normalized = normalizeBackupCode(code);
    if (!normalized) {
      return { valid: false, updatedCodes: storedCodes };
    }

    const candidateHash = hashBackupCode(normalized);
    let matched = false;

    const updatedCodes = storedCodes.map((entry) => {
      if (matched || entry.used) {
        return entry;
      }
      const isMatch = crypto.timingSafeEqual(
        Buffer.from(entry.hash, 'hex'),
        Buffer.from(candidateHash, 'hex')
      );
      if (isMatch) {
        matched = true;
        return { ...entry, used: true, usedAt: new Date() };
      }
      return entry;
    });

    return { valid: matched, updatedCodes };
  },

  /**
   * Verify either a TOTP token or a backup code. This is the shared entry
   * point used by both the login flow and the recovery flow.
   */
  async verifyOrRecover(params: {
    userId: string;
    token?: string;
    backupCode?: string;
    secret?: string;
    backupCodes?: BackupCode[];
  }): Promise<VerifyOrRecoverResult> {
    const { userId, token, backupCode, secret, backupCodes = [] } = params;

    if (token && secret) {
      const valid = authenticator.verify({ token, secret });
      if (valid) {
        await auditService.log({
          action: 'mfa.verified',
          userId,
          metadata: { method: 'totp' },
        });
        return { success: true, method: 'totp' };
      }
    }

    if (backupCode) {
      const { valid, updatedCodes } = this.verifyBackupCode(backupCode, backupCodes);
      if (valid) {
        await auditService.log({
          action: 'mfa.recovery_code_used',
          userId,
          metadata: { method: 'backup_code' },
        });
        return {
          success: true,
          method: 'backup_code',
          remainingBackupCodes: updatedCodes,
        };
      }
    }

    return { success: false };
  },

  /**
   * Record an MFA enrollment audit event. Called after a user successfully
   * confirms their first TOTP token during setup.
   */
  async recordEnrollment(userId: string): Promise<void> {
    await auditService.log({
      action: 'mfa.enrolled',
      userId,
      metadata: {},
    });
  },
};