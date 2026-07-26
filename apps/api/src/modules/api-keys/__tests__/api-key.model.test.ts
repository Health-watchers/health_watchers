import { describe, it, expect } from '@jest/globals';
import { generateApiKey, getKeyPrefix, hashApiKey } from '../models/api-key.model';

describe('API Key Model Utilities', () => {
  describe('generateApiKey', () => {
    it('should generate a key with hw_ prefix', () => {
      const key = generateApiKey();
      expect(key).toMatch(/^hw_/);
    });

    it('should generate keys of consistent length', () => {
      const key1 = generateApiKey();
      const key2 = generateApiKey();
      expect(key1.length).toBe(key2.length);
      expect(key1.length).toBe(67); // hw_ (3) + 64 hex chars
    });

    it('should generate unique keys', () => {
      const keys = new Set();
      for (let i = 0; i < 100; i++) {
        keys.add(generateApiKey());
      }
      expect(keys.size).toBe(100);
    });

    it('should only contain valid hex characters after prefix', () => {
      const key = generateApiKey();
      const hexPart = key.substring(3);
      expect(hexPart).toMatch(/^[0-9a-f]+$/);
    });
  });

  describe('getKeyPrefix', () => {
    it('should return first 11 characters (hw_ + 8 chars)', () => {
      const key = generateApiKey();
      const prefix = getKeyPrefix(key);
      expect(prefix.length).toBe(11);
      expect(prefix).toMatch(/^hw_[0-9a-f]{8}$/);
    });

    it('should be consistent for the same key', () => {
      const key = generateApiKey();
      const prefix1 = getKeyPrefix(key);
      const prefix2 = getKeyPrefix(key);
      expect(prefix1).toBe(prefix2);
    });

    it('should be different for different keys', () => {
      const key1 = generateApiKey();
      const key2 = generateApiKey();
      expect(getKeyPrefix(key1)).not.toBe(getKeyPrefix(key2));
    });
  });

  describe('hashApiKey', () => {
    it('should produce a SHA-256 hash', () => {
      const key = generateApiKey();
      const hash = hashApiKey(key);
      expect(hash).toMatch(/^[0-9a-f]{64}$/); // SHA-256 is 64 hex chars
    });

    it('should be deterministic', () => {
      const key = generateApiKey();
      const hash1 = hashApiKey(key);
      const hash2 = hashApiKey(key);
      expect(hash1).toBe(hash2);
    });

    it('should produce different hashes for different keys', () => {
      const key1 = generateApiKey();
      const key2 = generateApiKey();
      expect(hashApiKey(key1)).not.toBe(hashApiKey(key2));
    });

    it('should not be reversible', () => {
      const key = generateApiKey();
      const hash = hashApiKey(key);
      expect(hash).not.toContain(key);
      expect(hash).not.toContain(key.substring(3)); // Even without prefix
    });
  });

  describe('Key Security', () => {
    it('should not expose raw key in prefix', () => {
      const key = generateApiKey();
      const prefix = getKeyPrefix(key);
      const fullKey = key;
      expect(prefix).not.toBe(fullKey);
      expect(prefix.length).toBeLessThan(fullKey.length);
    });

    it('should hash different from original', () => {
      const key = generateApiKey();
      const hash = hashApiKey(key);
      expect(hash).not.toBe(key);
    });
  });
});
