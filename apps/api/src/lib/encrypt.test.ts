/**
 * Unit tests for lib/encrypt.ts
 */
import { encrypt, decrypt } from './encrypt';

const VALID_KEY = 'c'.repeat(64); // 64-char hex (32 bytes)
const prevKey = process.env.FIELD_ENCRYPTION_KEY;

beforeAll(() => {
  process.env.FIELD_ENCRYPTION_KEY = VALID_KEY;
});

afterAll(() => {
  if (prevKey === undefined) delete process.env.FIELD_ENCRYPTION_KEY;
  else process.env.FIELD_ENCRYPTION_KEY = prevKey;
});

describe('encrypt/decrypt round-trip', () => {
  it('round-trips a plaintext string', () => {
    const encoded = encrypt('hello world');
    expect(decrypt(encoded)).toBe('hello world');
  });

  it('round-trips PHI-like values with special characters', () => {
    const encoded = encrypt('John O\'Brien <john@example.com> {SSN: "123-45-6789"}');
    expect(decrypt(encoded)).toBe('John O\'Brien <john@example.com> {SSN: "123-45-6789"}');
  });

  it('produces distinct ciphertexts for identical inputs (random IV)', () => {
    const a = encrypt('same');
    const b = encrypt('same');
    expect(a).not.toBe(b);
  });

  it('returns the formatted iv:ciphertext:tag triple', () => {
    const encoded = encrypt('x');
    expect(encoded.split(':')).toHaveLength(3);
  });
});

describe('decrypt edge cases', () => {
  it('returns the input unchanged when it is not in iv:ciphertext:tag format', () => {
    expect(decrypt('plain-secret-value')).toBe('plain-secret-value');
    expect(decrypt('a:b')).toBe('a:b');
    expect(decrypt('')).toBe('');
  });
});

describe('key validation', () => {
  it('throws when FIELD_ENCRYPTION_KEY is not a 64-char hex string', () => {
    const bad = 'too-short';
    const saved = process.env.FIELD_ENCRYPTION_KEY;
    process.env.FIELD_ENCRYPTION_KEY = bad;
    expect(() => encrypt('x')).toThrow('FIELD_ENCRYPTION_KEY must be a 64-char hex string');
    process.env.FIELD_ENCRYPTION_KEY = saved;
  });

  it('tampering with the ciphertext produces a GCM auth failure', () => {
    const encoded = encrypt('secret');
    const [iv, ct, tag] = encoded.split(':');
    const tamperedCt = (parseInt(ct.slice(-2), 16) ^ 0xff).toString(16).padStart(2, '0');
    const tampered = `${iv}:${ct.slice(0, -2)}${tamperedCt}:${tag}`;
    expect(() => decrypt(tampered)).toThrow();
  });
});
