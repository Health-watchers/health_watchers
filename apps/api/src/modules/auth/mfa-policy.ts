import crypto from 'crypto';

// Roles that must have 2FA enabled
export const MFA_REQUIRED_ROLES = new Set(['CLINIC_ADMIN', 'SUPER_ADMIN', 'DOCTOR', 'NURSE']);

/** Roles for which a verified passkey satisfies the mandatory MFA requirement (#1496). */
export const PASSKEY_MFA_ROLES = new Set(['DOCTOR']);

export type MfaMethod = 'totp' | 'passkey' | 'backup_code';

/** SHA-256 hash of a token for safe storage */
export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/** Generate 10 single-use backup codes */
export function generateBackupCodes(): { plain: string[]; hashed: string[] } {
  const plain = Array.from({ length: 10 }, () => crypto.randomBytes(5).toString('hex'));
  const hashed = plain.map(hashToken);
  return { plain, hashed };
}

export function passkeySatisfiesMfa(user: { role: string; passkeyCount?: number }): boolean {
  return (user.passkeyCount ?? 0) > 0 && PASSKEY_MFA_ROLES.has(user.role);
}

/** Second factors the user can complete an MFA challenge with. */
export function availableMfaMethods(user: {
  role: string;
  mfaEnabled: boolean;
  passkeyCount?: number;
}): MfaMethod[] {
  const methods: MfaMethod[] = [];
  if (user.mfaEnabled) methods.push('totp');
  if (passkeySatisfiesMfa(user)) methods.push('passkey');
  if (methods.length > 0) methods.push('backup_code');
  return methods;
}
