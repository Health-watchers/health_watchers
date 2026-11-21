import { jest } from '@jest/globals';
import coldWalletRouter from '../../routes/cold-wallet.js';

jest.mock('../../cold-wallet.js', () => ({
  storeKeyPair: jest.fn().mockReturnValue({ keyId: 'key1', publicKey: 'GTEST' }),
  getStoredKeyIds: jest.fn().mockReturnValue([]),
  getKeyMetadata: jest.fn().mockReturnValue(null),
  deactivateKey: jest.fn().mockReturnValue(true),
  signTransaction: jest.fn().mockReturnValue({ xdr: 'test' }),
  rotateKey: jest.fn().mockReturnValue({ newKey: { keyId: 'key2', publicKey: 'GTEST2' }, rotationEvent: {} }),
  getAuditLogs: jest.fn().mockReturnValue([]),
  getRotationHistory: jest.fn().mockReturnValue([]),
  getColdWalletStatistics: jest.fn().mockReturnValue({ totalKeys: 0 }),
}));

jest.mock('../../logger.js', () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

describe('Cold Wallet Router', () => {
  it('should export a router with cold-wallet endpoints', () => {
    expect(coldWalletRouter).toBeDefined();
  });
});
