/**
 * backup-code.service.ts
 *
 * Manages MFA backup code lifecycle:
 * - Generation: 10 cryptographically random 8-char codes
 * - Regeneration: requires current password + TOTP (or existing backup code)
 * - Invalidation: all old codes replaced atomically on regeneration
 * - Count: returns remaining unused codes without exposing values
 */

import crypto from 'crypto';

export const BACKUP_CODE_COUNT = 10;
const CODE_LENGTH = 8; // characters (hex)

/**
 * Generate a fresh set of BACKUP_CODE_COUNT backup codes.
 * Returns plaintext codes — store hashed values in the DB.
 */
export function generateBackupCodes(): string[] {
  return Array.from({ length: BACKUP_CODE_COUNT }, () =>
    crypto.randomBytes(CODE_LENGTH / 2).toString('hex').toUpperCase(),
  );
}

/**
 * Formats backup codes for display: groups into pairs of 4 chars
 * e.g. "A1B2C3D4" → "A1B2-C3D4"
 */
export function formatBackupCode(code: string): string {
  const half = Math.floor(code.length / 2);
  return `${code.slice(0, half)}-${code.slice(half)}`;
}

/**
 * Counts remaining (unused) backup codes from a stored list.
 * Codes are marked as used by setting them to null/empty in the stored array.
 */
export function countRemainingCodes(storedCodes: (string | null)[]): number {
  return storedCodes.filter(Boolean).length;
}

/**
 * Validation result for a regeneration request.
 */
export type RegenAuthResult =
  | { valid: true }
  | { valid: false; reason: string };

/**
 * Validates that a regeneration request is properly authenticated.
 * Caller must verify password hash and TOTP/backup code before calling this.
 * This function enforces the policy: at least one second factor must be provided.
 */
export function validateRegenRequest(params: {
  passwordVerified: boolean;
  totpVerified: boolean;
  backupCodeVerified: boolean;
}): RegenAuthResult {
  if (!params.passwordVerified) {
    return { valid: false, reason: 'Current password is required to regenerate backup codes' };
  }
  if (!params.totpVerified && !params.backupCodeVerified) {
    return { valid: false, reason: 'TOTP code or existing backup code is required' };
  }
  return { valid: true };
}
