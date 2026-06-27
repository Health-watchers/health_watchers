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
      secret: () => 'SCZANGBA5RLKJZ65NOVCKVS2VIOWV2MRDBBR7BVNKPKGZBJKHOSXWC3',
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
          secret: () => 'SCZANGBA5RLKJZ65NOVCKVS2VIOWV2MRDBBR7BVNKPKGZBJKHOSXWC3',
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
      const first = encryptSecretKey(secret);
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

    it('stored encryptedSecretKey is NOT a raw Stellar secret (does not start with S)', () => {
      // Issue #596: verify encryption at rest — raw Stellar secrets start with 'S'
      const { generateClinicKeypair } = require('./keypair.service');
      const { encryptedSecretKey } = generateClinicKeypair();
      // The stored value must not be a raw Stellar secret key
      expect(encryptedSecretKey).not.toMatch(/^S[A-Z2-7]{55}$/);
      // It should be hex-encoded ciphertext:authTag format
      expect(encryptedSecretKey).toMatch(/^[0-9a-f]+:[0-9a-f]+$/);
    });
  });
});

/**
 * rotateClinicKeypair — Issue #707
 *
 * Covers:
 *  - Successful rotation: new keypair created, balance transferred, clinic updated, old keypair deactivated
 *  - Failed balance transfer triggers rollback (new keypair document deleted)
 *  - Clinic not found throws
 *  - No existing stellarPublicKey: skips transfer, still rotates
 *  - Key version increments correctly (starts at 1 when no prior keypair, increments otherwise)
 *  - Testnet funding attempted before balance transfer
 */
describe('rotateClinicKeypair', () => {
  const CLINIC_ID = '507f1f77bcf86cd799439011';
  const OLD_PUBLIC_KEY = 'GOLDPUBLICKEY1111111111111111111111111111111111111111111111';
  const NEW_PUBLIC_KEY = 'GCEZWKCA5VLDNRLN3RPRJMRZOX3Z6G5CHCGZQE3NMQKK6UUUHKKOAIB';

  let mockFindById: jest.Mock;
  let mockClinicUpdate: jest.Mock;
  let mockKeypairFindOne: jest.Mock;
  let mockKeypairCreate: jest.Mock;
  let mockKeypairFindByIdAndUpdate: jest.Mock;
  let mockKeypairFindByIdAndDelete: jest.Mock;
  let mockKeypairUpdateMany: jest.Mock;
  let mockTransferBalance: jest.Mock;
  let mockFundAccount: jest.Mock;
  let deps: any;

  beforeEach(() => {
    jest.resetModules();
    jest.mock('@stellar/stellar-sdk', () => ({
      Keypair: {
        random: () => ({
          publicKey: () => NEW_PUBLIC_KEY,
          secret: () => 'SCZANGBA5RLKJZ65NOVCKVS2VIOWV2MRDBBR7BVNKPKGZBJKHOSXWC3',
        }),
      },
    }));

    mockFindById = jest.fn().mockResolvedValue({
      _id: CLINIC_ID,
      stellarPublicKey: OLD_PUBLIC_KEY,
    });
    mockClinicUpdate = jest.fn().mockResolvedValue({});
    mockKeypairFindOne = jest.fn().mockReturnValue({
      sort: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue({ keyVersion: 1 }),
      }),
    });
    mockKeypairCreate = jest.fn().mockResolvedValue({ _id: 'new-kp-id' });
    mockKeypairFindByIdAndUpdate = jest.fn().mockResolvedValue({});
    mockKeypairFindByIdAndDelete = jest.fn().mockResolvedValue({});
    mockKeypairUpdateMany = jest.fn().mockResolvedValue({});
    mockTransferBalance = jest.fn().mockResolvedValue({ transferred: true, amount: '10', hash: 'txhash' });
    mockFundAccount = jest.fn().mockResolvedValue({ funded: true });

    deps = {
      ClinicModel: { findById: mockFindById, findByIdAndUpdate: mockClinicUpdate },
      ClinicKeypairModel: {
        findOne: mockKeypairFindOne,
        create: mockKeypairCreate,
        findByIdAndUpdate: mockKeypairFindByIdAndUpdate,
        findByIdAndDelete: mockKeypairFindByIdAndDelete,
        updateMany: mockKeypairUpdateMany,
      },
      stellarClient: { transferBalance: mockTransferBalance, fundAccount: mockFundAccount },
      stellarNetwork: 'testnet',
      logger: { warn: jest.fn(), error: jest.fn() },
    };
  });

  it('returns new publicKey and incremented keyVersion on success', async () => {
    const { rotateClinicKeypair } = require('./keypair.service');
    const result = await rotateClinicKeypair(CLINIC_ID, deps);
    expect(result.publicKey).toBe(NEW_PUBLIC_KEY);
    expect(result.keyVersion).toBe(2);
    expect(result.transferResult).toEqual({ transferred: true, amount: '10', hash: 'txhash' });
  });

  it('creates new keypair as inactive, then activates after successful transfer', async () => {
    const { rotateClinicKeypair } = require('./keypair.service');
    await rotateClinicKeypair(CLINIC_ID, deps);
    expect(mockKeypairCreate).toHaveBeenCalledWith(expect.objectContaining({ isActive: false }));
    expect(mockKeypairFindByIdAndUpdate).toHaveBeenCalledWith('new-kp-id', { isActive: true });
  });

  it('updates clinic stellarPublicKey to new key', async () => {
    const { rotateClinicKeypair } = require('./keypair.service');
    await rotateClinicKeypair(CLINIC_ID, deps);
    expect(mockClinicUpdate).toHaveBeenCalledWith(CLINIC_ID, { stellarPublicKey: NEW_PUBLIC_KEY });
  });

  it('deactivates old keypairs after successful rotation', async () => {
    const { rotateClinicKeypair } = require('./keypair.service');
    await rotateClinicKeypair(CLINIC_ID, deps);
    expect(mockKeypairUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({ clinicId: CLINIC_ID, isActive: true }),
      { isActive: false },
    );
  });

  it('calls transferBalance with old and new public keys', async () => {
    const { rotateClinicKeypair } = require('./keypair.service');
    await rotateClinicKeypair(CLINIC_ID, deps);
    expect(mockTransferBalance).toHaveBeenCalledWith(OLD_PUBLIC_KEY, NEW_PUBLIC_KEY);
  });

  it('rolls back (deletes new keypair) when balance transfer fails', async () => {
    mockTransferBalance.mockRejectedValue(new Error('Transfer failed'));
    const { rotateClinicKeypair } = require('./keypair.service');
    await expect(rotateClinicKeypair(CLINIC_ID, deps)).rejects.toThrow('Transfer failed');
    expect(mockKeypairFindByIdAndDelete).toHaveBeenCalledWith('new-kp-id');
    expect(mockClinicUpdate).not.toHaveBeenCalled();
    expect(mockKeypairUpdateMany).not.toHaveBeenCalled();
  });

  it('throws when clinic is not found', async () => {
    mockFindById.mockResolvedValue(null);
    const { rotateClinicKeypair } = require('./keypair.service');
    await expect(rotateClinicKeypair(CLINIC_ID, deps)).rejects.toThrow('Clinic not found');
  });

  it('skips transferBalance when clinic has no existing stellarPublicKey', async () => {
    mockFindById.mockResolvedValue({ _id: CLINIC_ID, stellarPublicKey: undefined });
    const { rotateClinicKeypair } = require('./keypair.service');
    const result = await rotateClinicKeypair(CLINIC_ID, deps);
    expect(mockTransferBalance).not.toHaveBeenCalled();
    expect(result.publicKey).toBe(NEW_PUBLIC_KEY);
  });

  it('starts keyVersion at 1 when no prior keypair exists', async () => {
    mockKeypairFindOne.mockReturnValue({
      sort: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(null) }),
    });
    const { rotateClinicKeypair } = require('./keypair.service');
    const result = await rotateClinicKeypair(CLINIC_ID, deps);
    expect(result.keyVersion).toBe(1);
    expect(mockKeypairCreate).toHaveBeenCalledWith(expect.objectContaining({ keyVersion: 1 }));
  });

  it('funds new account on testnet before balance transfer', async () => {
    const { rotateClinicKeypair } = require('./keypair.service');
    await rotateClinicKeypair(CLINIC_ID, deps);
    expect(mockFundAccount).toHaveBeenCalledWith(NEW_PUBLIC_KEY);
    expect(mockTransferBalance).toHaveBeenCalled();
  });
});
