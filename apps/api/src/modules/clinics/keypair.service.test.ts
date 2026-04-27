/**
 * keypair.service tests — Issue #367
 *
 * Covers:
 *  - encryptSecretKey / decryptSecretKey round-trip
 *  - generateClinicKeypair returns valid Stellar public key
 *  - decryptSecretKey recovers the original secret
 *  - Throws when KEYPAIR_ENCRYPTION_KEY is missing or wrong length
 *  - Encrypted value never equals plaintext
 */

// Mock @stellar/stellar-sdk so Jest doesn't try to parse its CJS bundle with Babel
jest.mock('@stellar/stellar-sdk', () => ({
  Keypair: {
    random: () => ({
      publicKey: () => 'GCEZWKCA5VLDNRLN3RPRJMRZOX3Z6G5CHCGZQE3NMQKK6UUUHKKOAIB',
      secret:    () => 'SCZANGBA5RLKJZ65NOVCKVS2VIOWV2MRDBBR7BVNKPKGZBJKHOSXWC3',
    }),
  },
}));

const TEST_KEY = 'a'.repeat(64);

describe('keypair.service', () => {
  beforeEach(() => {
    process.env.KEYPAIR_ENCRYPTION_KEY = TEST_KEY;
    jest.resetModules();
    // Re-apply mock after resetModules
    jest.mock('@stellar/stellar-sdk', () => ({
      Keypair: {
        random: () => ({
          publicKey: () => 'GCEZWKCA5VLDNRLN3RPRJMRZOX3Z6G5CHCGZQE3NMQKK6UUUHKKOAIB',
          secret:    () => 'SCZANGBA5RLKJZ65NOVCKVS2VIOWV2MRDBBR7BVNKPKGZBJKHOSXWC3',
        }),
      },
    }));
  });

  afterEach(() => {
    delete process.env.KEYPAIR_ENCRYPTION_KEY;
  });

  describe('encryptSecretKey / decryptSecretKey', () => {
    it('round-trips a secret key correctly', () => {
      const { encryptSecretKey, decryptSecretKey } = require('./keypair.service');
      const secret = 'SCZANGBA5RLKJZ65NOVCKVS2VIOWV2MRDBBR7BVNKPKGZBJKHOSXWC3';
      const { encryptedSecretKey, iv } = encryptSecretKey(secret);
      expect(decryptSecretKey(encryptedSecretKey, iv)).toBe(secret);
    });

    it('produces different ciphertext each call (random IV)', () => {
      const { encryptSecretKey } = require('./keypair.service');
      const secret = 'SCZANGBA5RLKJZ65NOVCKVS2VIOWV2MRDBBR7BVNKPKGZBJKHOSXWC3';
      const first  = encryptSecretKey(secret);
      const second = encryptSecretKey(secret);
      expect(first.iv).not.toBe(second.iv);
      expect(first.encryptedSecretKey).not.toBe(second.encryptedSecretKey);
    });

    it('encrypted value does not contain the plaintext', () => {
      const { encryptSecretKey } = require('./keypair.service');
      const secret = 'SCZANGBA5RLKJZ65NOVCKVS2VIOWV2MRDBBR7BVNKPKGZBJKHOSXWC3';
      const { encryptedSecretKey } = encryptSecretKey(secret);
      expect(encryptedSecretKey).not.toContain(secret);
    });

    it('throws when KEYPAIR_ENCRYPTION_KEY is missing', () => {
      delete process.env.KEYPAIR_ENCRYPTION_KEY;
      jest.resetModules();
      jest.mock('@stellar/stellar-sdk', () => ({ Keypair: { random: jest.fn() } }));
      const { encryptSecretKey } = require('./keypair.service');
      expect(() => encryptSecretKey('test')).toThrow('KEYPAIR_ENCRYPTION_KEY');
    });

    it('throws when KEYPAIR_ENCRYPTION_KEY is wrong length', () => {
      process.env.KEYPAIR_ENCRYPTION_KEY = 'tooshort';
      jest.resetModules();
      jest.mock('@stellar/stellar-sdk', () => ({ Keypair: { random: jest.fn() } }));
      const { encryptSecretKey } = require('./keypair.service');
      expect(() => encryptSecretKey('test')).toThrow('KEYPAIR_ENCRYPTION_KEY');
    });

    it('throws on tampered ciphertext (auth tag mismatch)', () => {
      const { encryptSecretKey, decryptSecretKey } = require('./keypair.service');
      const { encryptedSecretKey, iv } = encryptSecretKey('mysecret');
      const tampered = encryptedSecretKey.slice(0, -4) + '0000';
      expect(() => decryptSecretKey(tampered, iv)).toThrow();
    });
  });

  describe('generateClinicKeypair', () => {
    it('returns publicKey, encryptedSecretKey, and iv', () => {
      const { generateClinicKeypair } = require('./keypair.service');
      const result = generateClinicKeypair();
      expect(result.publicKey).toBeTruthy();
      expect(result.encryptedSecretKey).toBeTruthy();
      expect(result.iv).toBeTruthy();
    });

    it('decrypted secret matches the mocked keypair secret', () => {
      const { generateClinicKeypair, decryptSecretKey } = require('./keypair.service');
      const { encryptedSecretKey, iv } = generateClinicKeypair();
      const secret = decryptSecretKey(encryptedSecretKey, iv);
      expect(secret).toBe('SCZANGBA5RLKJZ65NOVCKVS2VIOWV2MRDBBR7BVNKPKGZBJKHOSXWC3');
    });

    it('public key matches the mocked keypair public key', () => {
      const { generateClinicKeypair } = require('./keypair.service');
      const { publicKey } = generateClinicKeypair();
      expect(publicKey).toBe('GCEZWKCA5VLDNRLN3RPRJMRZOX3Z6G5CHCGZQE3NMQKK6UUUHKKOAIB');
    });
  });
});
