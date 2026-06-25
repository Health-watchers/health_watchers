/**
 * keypair-rotation.service tests — Issue #653
 *
 * Covers:
 *  - Successful rotation: new keypair created, balance transferred, clinic updated, old keypair deactivated
 *  - Rollback: new keypair document deleted when balance transfer fails
 *  - Clinic not found throws
 *  - No old public key: skips transfer, still rotates
 *  - Key version increments correctly
 *  - Testnet funding called before transfer
 */

jest.mock('@stellar/stellar-sdk', () => ({
  Keypair: {
    random: () => ({
      publicKey: () => 'GNEWPUBLICKEY111111111111111111111111111111111111111111111',
      secret: () => 'SNEWSECRETKEY111111111111111111111111111111111111111111111',
    }),
  },
}));

jest.mock('@api/services/metrics.service', () => ({
  mongodbKeyDecryptionFailures: { inc: jest.fn() },
}));

process.env.KEYPAIR_ENCRYPTION_KEY = 'a'.repeat(64);

import { rotateClinicKeypair } from './keypair.service';

const CLINIC_ID = '507f1f77bcf86cd799439011';
const OLD_PUBLIC_KEY = 'GOLDPUBLICKEY1111111111111111111111111111111111111111111111';
const NEW_PUBLIC_KEY = 'GNEWPUBLICKEY111111111111111111111111111111111111111111111';

describe('rotateClinicKeypair', () => {
  let mockFindById: jest.Mock;
  let mockClinicFindByIdAndUpdate: jest.Mock;
  let mockKeypairFindOne: jest.Mock;
  let mockKeypairCreate: jest.Mock;
  let mockKeypairFindByIdAndUpdate: jest.Mock;
  let mockKeypairFindByIdAndDelete: jest.Mock;
  let mockKeypairUpdateMany: jest.Mock;
  let mockTransferBalance: jest.Mock;
  let mockFundAccount: jest.Mock;
  let deps: any;

  beforeEach(() => {
    mockFindById = jest.fn().mockResolvedValue({
      _id: CLINIC_ID,
      name: 'Test Clinic',
      stellarPublicKey: OLD_PUBLIC_KEY,
    });
    mockClinicFindByIdAndUpdate = jest.fn().mockResolvedValue({});
    mockKeypairFindOne = jest.fn().mockReturnValue({
      sort: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue({ keyVersion: 1 }),
      }),
    });
    mockKeypairCreate = jest.fn().mockResolvedValue({ _id: 'new-keypair-id' });
    mockKeypairFindByIdAndUpdate = jest.fn().mockResolvedValue({});
    mockKeypairFindByIdAndDelete = jest.fn().mockResolvedValue({});
    mockKeypairUpdateMany = jest.fn().mockResolvedValue({});
    mockTransferBalance = jest.fn().mockResolvedValue({ transferred: true, amount: '10', hash: 'txhash' });
    mockFundAccount = jest.fn().mockResolvedValue({ funded: true });

    deps = {
      ClinicModel: {
        findById: mockFindById,
        findByIdAndUpdate: mockClinicFindByIdAndUpdate,
      },
      ClinicKeypairModel: {
        findOne: mockKeypairFindOne,
        create: mockKeypairCreate,
        findByIdAndUpdate: mockKeypairFindByIdAndUpdate,
        findByIdAndDelete: mockKeypairFindByIdAndDelete,
        updateMany: mockKeypairUpdateMany,
      },
      stellarClient: {
        transferBalance: mockTransferBalance,
        fundAccount: mockFundAccount,
      },
      stellarNetwork: 'testnet',
      logger: { warn: jest.fn(), error: jest.fn() },
    };
  });

  it('returns new publicKey and incremented keyVersion on success', async () => {
    const result = await rotateClinicKeypair(CLINIC_ID, deps);
    expect(result.publicKey).toBe(NEW_PUBLIC_KEY);
    expect(result.keyVersion).toBe(2);
    expect(result.transferResult).toEqual({ transferred: true, amount: '10', hash: 'txhash' });
  });

  it('creates new keypair as inactive initially', async () => {
    await rotateClinicKeypair(CLINIC_ID, deps);
    expect(mockKeypairCreate).toHaveBeenCalledWith(
      expect.objectContaining({ isActive: false, keyVersion: 2 }),
    );
  });

  it('activates new keypair after successful transfer', async () => {
    await rotateClinicKeypair(CLINIC_ID, deps);
    expect(mockKeypairFindByIdAndUpdate).toHaveBeenCalledWith('new-keypair-id', { isActive: true });
  });

  it('updates clinic stellarPublicKey to new key', async () => {
    await rotateClinicKeypair(CLINIC_ID, deps);
    expect(mockClinicFindByIdAndUpdate).toHaveBeenCalledWith(
      CLINIC_ID,
      { stellarPublicKey: NEW_PUBLIC_KEY },
    );
  });

  it('deactivates old keypairs after activation', async () => {
    await rotateClinicKeypair(CLINIC_ID, deps);
    expect(mockKeypairUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({ clinicId: CLINIC_ID, isActive: true }),
      { isActive: false },
    );
  });

  it('calls transferBalance with old and new public keys', async () => {
    await rotateClinicKeypair(CLINIC_ID, deps);
    expect(mockTransferBalance).toHaveBeenCalledWith(OLD_PUBLIC_KEY, NEW_PUBLIC_KEY);
  });

  it('rolls back (deletes new keypair) when balance transfer fails', async () => {
    mockTransferBalance.mockRejectedValue(new Error('Transfer failed'));
    await expect(rotateClinicKeypair(CLINIC_ID, deps)).rejects.toThrow('Transfer failed');
    expect(mockKeypairFindByIdAndDelete).toHaveBeenCalledWith('new-keypair-id');
    expect(mockClinicFindByIdAndUpdate).not.toHaveBeenCalled();
    expect(mockKeypairUpdateMany).not.toHaveBeenCalled();
  });

  it('throws when clinic is not found', async () => {
    mockFindById.mockResolvedValue(null);
    await expect(rotateClinicKeypair(CLINIC_ID, deps)).rejects.toThrow('Clinic not found');
  });

  it('skips transferBalance when clinic has no existing stellarPublicKey', async () => {
    mockFindById.mockResolvedValue({ _id: CLINIC_ID, name: 'Test Clinic', stellarPublicKey: undefined });
    const result = await rotateClinicKeypair(CLINIC_ID, deps);
    expect(mockTransferBalance).not.toHaveBeenCalled();
    expect(result.publicKey).toBe(NEW_PUBLIC_KEY);
    expect(result.transferResult).toBeUndefined();
  });

  it('starts keyVersion at 1 when no prior keypair exists', async () => {
    mockKeypairFindOne.mockReturnValue({
      sort: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(null) }),
    });
    const result = await rotateClinicKeypair(CLINIC_ID, deps);
    expect(result.keyVersion).toBe(1);
    expect(mockKeypairCreate).toHaveBeenCalledWith(expect.objectContaining({ keyVersion: 1 }));
  });

  it('funds new account on testnet before transfer', async () => {
    await rotateClinicKeypair(CLINIC_ID, deps);
    expect(mockFundAccount).toHaveBeenCalledWith(NEW_PUBLIC_KEY);
  });
});
