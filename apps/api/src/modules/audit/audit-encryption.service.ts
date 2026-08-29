/**
 * Audit Log Encryption Service
 * Handles encryption at rest for sensitive audit data
 * Issue #1236
 */

import crypto from 'crypto';
import logger from '@api/utils/logger';

export class AuditEncryptionService {
  private readonly encryptionKey = process.env.AUDIT_ENCRYPTION_KEY;
  private readonly algorithm = 'aes-256-gcm';

  /**
   * Encrypt sensitive audit data
   */
  encrypt(data: Record<string, any>): { encrypted: string; iv: string; authTag: string } {
    if (!this.encryptionKey) {
      throw new Error('AUDIT_ENCRYPTION_KEY not configured');
    }

    try {
      const iv = crypto.randomBytes(16);
      const cipher = crypto.createCipheriv(this.algorithm, Buffer.from(this.encryptionKey, 'hex'), iv);

      const jsonData = JSON.stringify(data);
      let encrypted = cipher.update(jsonData, 'utf8', 'hex');
      encrypted += cipher.final('hex');

      const authTag = cipher.getAuthTag();

      return {
        encrypted,
        iv: iv.toString('hex'),
        authTag: authTag.toString('hex'),
      };
    } catch (error) {
      logger.error('Failed to encrypt audit data:', error);
      throw error;
    }
  }

  /**
   * Decrypt audit data
   */
  decrypt(
    encrypted: string,
    iv: string,
    authTag: string
  ): Record<string, any> {
    if (!this.encryptionKey) {
      throw new Error('AUDIT_ENCRYPTION_KEY not configured');
    }

    try {
      const decipher = crypto.createDecipheriv(
        this.algorithm,
        Buffer.from(this.encryptionKey, 'hex'),
        Buffer.from(iv, 'hex')
      );

      decipher.setAuthTag(Buffer.from(authTag, 'hex'));

      let decrypted = decipher.update(encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');

      return JSON.parse(decrypted);
    } catch (error) {
      logger.error('Failed to decrypt audit data:', error);
      throw error;
    }
  }

  /**
   * Hash sensitive data for comparison without decryption
   */
  hashData(data: string): string {
    return crypto.createHash('sha256').update(data).digest('hex');
  }
}

export const auditEncryptionService = new AuditEncryptionService();
