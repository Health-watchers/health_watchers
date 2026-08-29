import { Keypair } from '@stellar/stellar-sdk';
import * as coldWallet from '../cold-wallet.js';

describe('Cold Wallet', () => {
  beforeEach(() => {
    coldWallet.clearAllKeys();
  });

  const testKeypair = Keypair.random();
  const encryptionPassword = 'super-secure-password-123';

  describe('Key Storage and Retrieval', () => {
    it('should store an encrypted keypair', () => {
      const store = coldWallet.storeKeyPair(testKeypair, encryptionPassword);

      expect(store).toHaveProperty('keyId');
      expect(store).toHaveProperty('publicKey', testKeypair.publicKey());
      expect(store).toHaveProperty('encryptedSecretKey');
      expect(store).toHaveProperty('iv');
      expect(store).toHaveProperty('salt');
      expect(store).toHaveProperty('isActive', true);
      expect(store).toHaveProperty('algorithm');
      expect(store).toHaveProperty('createdAt');
    });

    it('should retrieve a stored keypair', () => {
      const stored = coldWallet.storeKeyPair(testKeypair, encryptionPassword);
      const retrieved = coldWallet.retrieveKeyPair(stored.keyId, encryptionPassword, 'test-actor');

      expect(retrieved.publicKey()).toBe(testKeypair.publicKey());
      expect(retrieved.secret()).toBe(testKeypair.secret());
    });

    it('should fail to retrieve with wrong password', () => {
      const stored = coldWallet.storeKeyPair(testKeypair, encryptionPassword);

      expect(() => {
        coldWallet.retrieveKeyPair(stored.keyId, 'wrong-password', 'test-actor');
      }).toThrow();
    });

    it('should not retrieve inactive keys', () => {
      const stored = coldWallet.storeKeyPair(testKeypair, encryptionPassword);
      coldWallet.deactivateKey(stored.keyId, 'test-actor');

      expect(() => {
        coldWallet.retrieveKeyPair(stored.keyId, encryptionPassword, 'test-actor');
      }).toThrow();
    });
  });

  describe('Key Rotation', () => {
    it('should rotate a key', () => {
      const oldStore = coldWallet.storeKeyPair(testKeypair, encryptionPassword);
      const { newKey, oldKey } = coldWallet.rotateKey(
        oldStore.keyId,
        encryptionPassword,
        'Scheduled rotation',
        'admin'
      );

      expect(oldKey.isActive).toBe(false);
      expect(newKey.isActive).toBe(true);
      expect(newKey.publicKey).toBe(testKeypair.publicKey());
    });

    it('should track rotation events', () => {
      const oldStore = coldWallet.storeKeyPair(testKeypair, encryptionPassword);
      coldWallet.rotateKey(oldStore.keyId, encryptionPassword, 'Scheduled rotation', 'admin');

      const history = coldWallet.getRotationHistory(10);
      expect(history.length).toBeGreaterThan(0);
      expect(history[history.length - 1].status).toBe('completed');
    });

    it('should fail rotation with invalid key', () => {
      expect(() => {
        coldWallet.rotateKey('invalid-key-id', encryptionPassword, 'Test', 'admin');
      }).toThrow();
    });
  });

  describe('Encryption', () => {
    it('should encrypt and decrypt correctly', () => {
      const secretKey = testKeypair.secret();
      const { encrypted, iv, salt } = coldWallet.encryptSecretKey(secretKey, encryptionPassword);

      const decrypted = coldWallet.decryptSecretKey(encrypted, encryptionPassword, salt, iv);
      expect(decrypted).toBe(secretKey);
    });

    it('should fail decryption with wrong password', () => {
      const secretKey = testKeypair.secret();
      const { encrypted, iv, salt } = coldWallet.encryptSecretKey(secretKey, encryptionPassword);

      expect(() => {
        coldWallet.decryptSecretKey(encrypted, 'wrong-password', salt, iv);
      }).toThrow();
    });
  });

  describe('Audit Logging', () => {
    it('should log audit events', () => {
      coldWallet.storeKeyPair(testKeypair, encryptionPassword);

      const logs = coldWallet.getAuditLogs({ limit: 10 });
      expect(logs.length).toBeGreaterThan(0);
      expect(logs.some((l) => l.eventType === 'key_creation')).toBe(true);
    });

    it('should filter audit logs by key ID', () => {
      const store = coldWallet.storeKeyPair(testKeypair, encryptionPassword);
      coldWallet.getAuditLogs({ keyId: store.keyId });

      const logs = coldWallet.getAuditLogs({ keyId: store.keyId });
      expect(logs.length).toBeGreaterThan(0);
      expect(logs.every((l) => l.keyId === store.keyId)).toBe(true);
    });

    it('should filter audit logs by event type', () => {
      coldWallet.storeKeyPair(testKeypair, encryptionPassword);

      const logs = coldWallet.getAuditLogs({ eventType: 'key_creation' });
      expect(logs.length).toBeGreaterThan(0);
      expect(logs.every((l) => l.eventType === 'key_creation')).toBe(true);
    });

    it('should filter audit logs by actor', () => {
      const store = coldWallet.storeKeyPair(testKeypair, encryptionPassword);
      coldWallet.retrieveKeyPair(store.keyId, encryptionPassword, 'test-actor');

      const logs = coldWallet.getAuditLogs({ actor: 'test-actor' });
      expect(logs.length).toBeGreaterThan(0);
      expect(logs.every((l) => l.actor === 'test-actor')).toBe(true);
    });

    it('should record successful operations', () => {
      const store = coldWallet.storeKeyPair(testKeypair, encryptionPassword);

      const logs = coldWallet.getAuditLogs({ keyId: store.keyId });
      const successLogs = logs.filter((l) => l.result === 'success');
      expect(successLogs.length).toBeGreaterThan(0);
    });

    it('should record failed operations', () => {
      try {
        coldWallet.retrieveKeyPair('invalid-id', encryptionPassword, 'test-actor');
      } catch {
        // Expected
      }

      const logs = coldWallet.getAuditLogs({ eventType: 'key_retrieval' });
      const failedLogs = logs.filter((l) => l.result === 'failure');
      expect(failedLogs.length).toBeGreaterThan(0);
    });
  });

  describe('Key Management', () => {
    it('should get stored key IDs', () => {
      coldWallet.storeKeyPair(testKeypair, encryptionPassword);
      const keypair2 = Keypair.random();
      coldWallet.storeKeyPair(keypair2, encryptionPassword);

      const keyIds = coldWallet.getStoredKeyIds();
      expect(keyIds.length).toBeGreaterThanOrEqual(2);
    });

    it('should get key metadata without sensitive data', () => {
      const store = coldWallet.storeKeyPair(testKeypair, encryptionPassword, { name: 'Test Key' });
      const metadata = coldWallet.getKeyMetadata(store.keyId);

      expect(metadata).toHaveProperty('publicKey');
      expect(metadata).toHaveProperty('keyId');
      expect(metadata).not.toHaveProperty('encryptedSecretKey');
      expect(metadata).not.toHaveProperty('iv');
      expect(metadata).not.toHaveProperty('salt');
    });

    it('should deactivate a key', () => {
      const store = coldWallet.storeKeyPair(testKeypair, encryptionPassword);
      const success = coldWallet.deactivateKey(store.keyId, 'admin');

      expect(success).toBe(true);

      const metadata = coldWallet.getKeyMetadata(store.keyId);
      expect(metadata?.isActive).toBe(false);
    });

    it('should not deactivate non-existent key', () => {
      const success = coldWallet.deactivateKey('invalid-id', 'admin');
      expect(success).toBe(false);
    });
  });

  describe('Statistics', () => {
    it('should provide cold wallet statistics', () => {
      coldWallet.storeKeyPair(testKeypair, encryptionPassword);
      const keypair2 = Keypair.random();
      coldWallet.storeKeyPair(keypair2, encryptionPassword);

      const stats = coldWallet.getColdWalletStatistics();
      expect(stats).toHaveProperty('totalKeys');
      expect(stats).toHaveProperty('activeKeys');
      expect(stats).toHaveProperty('totalSigningRequests');
      expect(stats).toHaveProperty('totalRotations');
      expect(stats).toHaveProperty('auditLogSize');
      expect(stats.totalKeys).toBeGreaterThanOrEqual(2);
      expect(stats.activeKeys).toBeGreaterThanOrEqual(2);
    });

    it('should track deactivated keys in statistics', () => {
      const store = coldWallet.storeKeyPair(testKeypair, encryptionPassword);
      coldWallet.deactivateKey(store.keyId, 'admin');

      const stats = coldWallet.getColdWalletStatistics();
      expect(stats.totalKeys).toBe(1);
      expect(stats.activeKeys).toBe(0);
    });
  });

  describe('Memory Management', () => {
    it('should maintain audit log size limit', () => {
      // Create many audit events
      for (let i = 0; i < 15000; i++) {
        const kp = Keypair.random();
        coldWallet.storeKeyPair(kp, encryptionPassword);
      }

      const stats = coldWallet.getColdWalletStatistics();
      // Should be limited to ~10000 logs
      expect(stats.auditLogSize).toBeLessThanOrEqual(10100); // Allow small buffer
    });
  });

  describe('Clear All Keys', () => {
    it('should clear all keys and logs', () => {
      coldWallet.storeKeyPair(testKeypair, encryptionPassword);

      let stats = coldWallet.getColdWalletStatistics();
      expect(stats.totalKeys).toBeGreaterThan(0);

      coldWallet.clearAllKeys();

      stats = coldWallet.getColdWalletStatistics();
      expect(stats.totalKeys).toBe(0);
      expect(stats.auditLogSize).toBe(0);
    });
  });
});
