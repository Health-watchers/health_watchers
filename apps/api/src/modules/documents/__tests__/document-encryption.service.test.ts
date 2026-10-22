/**
 * Document at-rest envelope encryption — Issue #1247
 */
jest.mock('@health-watchers/config', () => ({
  config: {
    storage: {
      documentEncryptionKey: 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2',
    },
  },
}));

import {
  encryptBuffer,
  decryptBuffer,
  sha256,
  isEncryptionConfigured,
} from '../document-encryption.service';

describe('document-encryption.service', () => {
  it('reports encryption as configured', () => {
    expect(isEncryptionConfigured()).toBe(true);
  });

  it('round-trips a buffer through encrypt/decrypt', () => {
    const plain = Buffer.from('patient chart — confidential PHI payload', 'utf8');
    const { ciphertext, encryption } = encryptBuffer(plain);

    expect(ciphertext.equals(plain)).toBe(false);
    expect(encryption.algorithm).toBe('aes-256-gcm');

    const back = decryptBuffer(ciphertext, encryption);
    expect(back.equals(plain)).toBe(true);
  });

  it('uses a unique data key + IV per call', () => {
    const plain = Buffer.from('same bytes');
    const a = encryptBuffer(plain);
    const b = encryptBuffer(plain);
    expect(a.encryption.iv).not.toBe(b.encryption.iv);
    expect(a.encryption.wrappedKey).not.toBe(b.encryption.wrappedKey);
    expect(a.ciphertext.equals(b.ciphertext)).toBe(false);
  });

  it('fails authentication when the ciphertext is tampered with', () => {
    const { ciphertext, encryption } = encryptBuffer(Buffer.from('integrity matters'));
    ciphertext[0] ^= 0xff;
    expect(() => decryptBuffer(ciphertext, encryption)).toThrow();
  });

  it('sha256 is stable and hex-encoded', () => {
    expect(sha256(Buffer.from('abc'))).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
    );
  });
});
