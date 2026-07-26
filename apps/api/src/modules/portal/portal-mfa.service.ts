import crypto from 'crypto';
import { totpService } from '../auth/totp.service';

export const portalMfaService = {
  /**
   * Generate backup codes for portal MFA
   */
  generateBackupCodes(): { plain: string[]; hashed: string[] } {
    const plain = Array.from({ length: 10 }, () => crypto.randomBytes(5).toString('hex'));
    const hashed = plain.map((code) => crypto.createHash('sha256').update(code).digest('hex'));
    return { plain, hashed };
  },

  /**
   * Setup TOTP for portal MFA
   */
  async setupTotp(email: string): Promise<{ secret: string; qrCodeDataUrl: string }> {
    const { secret, qrCodeDataUrl } = await totpService.setup(email);
    return { secret, qrCodeDataUrl };
  },

  /**
   * Verify TOTP code
   */
  verifyTotp(code: string, secret: string): boolean {
    return totpService.verify(code, secret);
  },

  /**
   * Verify backup code (one-time use)
   */
  verifyBackupCode(code: string, hashedCodes: string[]): boolean {
    const codeHash = crypto.createHash('sha256').update(code).digest('hex');
    return hashedCodes.includes(codeHash);
  },

  /**
   * Remove used backup code from list
   */
  removeUsedBackupCode(code: string, hashedCodes: string[]): string[] {
    const codeHash = crypto.createHash('sha256').update(code).digest('hex');
    return hashedCodes.filter((hash) => hash !== codeHash);
  },
};
