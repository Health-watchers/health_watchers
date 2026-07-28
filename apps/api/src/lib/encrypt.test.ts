import { encrypt, decrypt } from './encrypt';

const TEST_KEY = 'a'.repeat(64); // 32-byte hex key for testing

beforeEach(() => {
  process.env.FIELD_ENCRYPTION_KEY = TEST_KEY;
  process.env.FIELD_ENCRYPTION_KEY_VERSION = '1';
  delete process.env.FIELD_ENCRYPTION_KEY_V1;
  delete process.env.FIELD_ENCRYPTION_KEY_V2;
});

describe('encrypt', () => {
  it('produces a versioned colon-delimited hex string', () => {
    const result = encrypt('hello');
    expect(result).toMatch(/^v\d+:[0-9a-f]+:[0-9a-f]+:[0-9a-f]+$/);
  });

  it('produces different ciphertext for the same input (random IV)', () => {
    const a = encrypt('same');
    const b = encrypt('same');
    expect(a).not.toBe(b);
  });
});

describe('decrypt', () => {
  it('round-trips plaintext', () => {
    const plaintext = 'sensitive PHI value';
    expect(decrypt(encrypt(plaintext))).toBe(plaintext);
  });

  it('round-trips empty string', () => {
    expect(decrypt(encrypt(''))).toBe('');
  });

  it('round-trips a string with special characters', () => {
    const value = 'Ünïcödé & <script>alert(1)</script>';
    expect(decrypt(encrypt(value))).toBe(value);
  });

  it('returns non-encrypted value unchanged', () => {
    expect(decrypt('plaintext')).toBe('plaintext');
    expect(decrypt('')).toBe('');
  });

  it('decrypts with old key during key rotation', () => {
    // Encrypt with version 1
    const plaintext = 'rotate me';
    const ciphertext = encrypt(plaintext);

    // Simulate rotation: bump to version 2, keep old key as V1
    process.env.FIELD_ENCRYPTION_KEY_V1 = TEST_KEY;
    process.env.FIELD_ENCRYPTION_KEY = 'b'.repeat(64);
    process.env.FIELD_ENCRYPTION_KEY_VERSION = '2';

    // Re-import to pick up new env vars (Jest module cache — call decrypt directly)
    // decrypt reads env at call time, so it should resolve V1 key for v1: prefix
    expect(decrypt(ciphertext)).toBe(plaintext);
  });

  it('encrypts new values with the current (rotated) key', () => {
    process.env.FIELD_ENCRYPTION_KEY = 'b'.repeat(64);
    process.env.FIELD_ENCRYPTION_KEY_VERSION = '2';
    const plaintext = 'new value';
    const ciphertext = encrypt(plaintext);
    expect(ciphertext.startsWith('v2:')).toBe(true);
    expect(decrypt(ciphertext)).toBe(plaintext);
  });
});

describe('error handling', () => {
  it('throws if FIELD_ENCRYPTION_KEY is missing or invalid', () => {
    process.env.FIELD_ENCRYPTION_KEY = 'short';
    expect(() => encrypt('x')).toThrow('FIELD_ENCRYPTION_KEY must be a 64-char hex string');
  });

  it('throws if versioned key is missing during decryption', () => {
    const ciphertext = encrypt('x'); // encrypted with v1 (TEST_KEY)
    // Rotate to v2 without providing V1 fallback
    process.env.FIELD_ENCRYPTION_KEY = 'b'.repeat(64);
    process.env.FIELD_ENCRYPTION_KEY_VERSION = '2';
    // v1 key is not set → should throw
    expect(() => decrypt(ciphertext)).toThrow();
  });
});
