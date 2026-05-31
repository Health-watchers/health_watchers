import {
  generateBackupCodes,
  formatBackupCode,
  countRemainingCodes,
  validateRegenRequest,
  BACKUP_CODE_COUNT,
} from '../backup-code.service';

describe('generateBackupCodes', () => {
  it('generates exactly 10 codes', () => {
    const codes = generateBackupCodes();
    expect(codes.length).toBe(BACKUP_CODE_COUNT);
  });

  it('each code is 8 hex characters (uppercase)', () => {
    const codes = generateBackupCodes();
    codes.forEach(c => {
      expect(c).toMatch(/^[0-9A-F]{8}$/);
    });
  });

  it('codes are unique within a generated set', () => {
    const codes = generateBackupCodes();
    expect(new Set(codes).size).toBe(BACKUP_CODE_COUNT);
  });

  it('two generations produce different codes', () => {
    const a = generateBackupCodes();
    const b = generateBackupCodes();
    // Extremely unlikely to collide; if it does, the RNG is broken
    expect(a.join()).not.toBe(b.join());
  });
});

describe('formatBackupCode', () => {
  it('inserts hyphen in the middle', () => {
    expect(formatBackupCode('A1B2C3D4')).toBe('A1B2-C3D4');
  });
});

describe('countRemainingCodes', () => {
  it('counts only non-null entries', () => {
    expect(countRemainingCodes(['ABC', null, 'DEF', null, 'GHI'])).toBe(3);
  });

  it('returns 0 for all-used set', () => {
    expect(countRemainingCodes([null, null, null])).toBe(0);
  });

  it('returns full count for unused set', () => {
    const codes = generateBackupCodes();
    expect(countRemainingCodes(codes)).toBe(BACKUP_CODE_COUNT);
  });
});

describe('validateRegenRequest', () => {
  it('accepts password + TOTP', () => {
    const result = validateRegenRequest({ passwordVerified: true, totpVerified: true, backupCodeVerified: false });
    expect(result.valid).toBe(true);
  });

  it('accepts password + backup code', () => {
    const result = validateRegenRequest({ passwordVerified: true, totpVerified: false, backupCodeVerified: true });
    expect(result.valid).toBe(true);
  });

  it('rejects without password', () => {
    const result = validateRegenRequest({ passwordVerified: false, totpVerified: true, backupCodeVerified: false });
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.reason).toContain('password');
  });

  it('rejects with password but no second factor', () => {
    const result = validateRegenRequest({ passwordVerified: true, totpVerified: false, backupCodeVerified: false });
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.reason).toContain('TOTP');
  });
});
