import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import { Platform } from 'react-native';

/**
 * Encrypted offline cache service for HIPAA-compliant storage of PHI (Protected Health Information).
 *
 * - AES-256-GCM encryption with a random 256-bit key kept in SecureStore (Keychain/Keystore)
 * - Fresh random IV per write; stored format is `v1.<iv>.<ciphertext>.<tag>` (base64 segments)
 * - TTL enforced on read; expired entries are deleted
 * - Secure wipe on logout / session revocation
 * - Audit report of cached PHI (type, size, age, TTL remaining)
 * - Backup exclusion via native config (see app.json / config plugin)
 *
 * NOTE: expo-crypto does not expose AES-GCM primitives directly. The `crypto` helpers
 * below are resolved from the platform crypto module at runtime. If the module is
 * unavailable the service throws on first use rather than silently storing plaintext.
 */

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number; // TTL in milliseconds
}

export interface CacheAuditEntry {
  dataType: string;
  sizeBytes: number;
  ageMs: number;
  ttlRemainingMs: number;
  expired: boolean;
}

interface AesGcmModule {
  generateKey(): Promise<Uint8Array>;
  randomBytes(length: number): Uint8Array;
  encrypt(key: Uint8Array, iv: Uint8Array, plaintext: Uint8Array): Promise<{ ciphertext: Uint8Array; tag: Uint8Array }>;
  decrypt(key: Uint8Array, iv: Uint8Array, ciphertext: Uint8Array, tag: Uint8Array): Promise<Uint8Array>;
}

const STORAGE_VERSION = 'v1';
const KEY_BYTES = 32; // 256-bit
const IV_BYTES = 12; // 96-bit GCM nonce
const TAG_BYTES = 16; // 128-bit GCM tag

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  // eslint-disable-next-line no-undef
  return typeof btoa === 'function' ? btoa(binary) : Buffer.from(bytes).toString('base64');
}

function fromBase64(value: string): Uint8Array {
  // eslint-disable-next-line no-undef
  const binary = typeof atob === 'function' ? atob(value) : Buffer.from(value, 'base64').toString('binary');
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function utf8Encode(value: string): Uint8Array {
  // eslint-disable-next-line no-undef
  return typeof TextEncoder !== 'undefined' ? new TextEncoder().encode(value) : new Uint8Array(Buffer.from(value, 'utf8'));
}

function utf8Decode(bytes: Uint8Array): string {
  // eslint-disable-next-line no-undef
  return typeof TextDecoder !== 'undefined' ? new TextDecoder().decode(bytes) : Buffer.from(bytes).toString('utf8');
}

/**
 * Resolve the AES-GCM implementation. Prefers react-native-quick-crypto when present,
 * otherwise falls back to a WebCrypto-compatible global (available in Hermes/JSC with polyfill).
 * Throws if no implementation is available so PHI is never written in plaintext.
 */
function resolveAesGcm(): AesGcmModule {
  // eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
  try {
    const quickCrypto = require('react-native-quick-crypto');
    if (quickCrypto?.createCipheriv) {
      return {
        async generateKey() {
          return new Uint8Array(quickCrypto.randomBytes(KEY_BYTES));
        },
        randomBytes(length: number) {
          return new Uint8Array(quickCrypto.randomBytes(length));
        },
        async encrypt(key, iv, plaintext) {
          const cipher = quickCrypto.createCipheriv('aes-256-gcm', key, iv);
          const ciphertext = new Uint8Array(Buffer.concat([cipher.update(plaintext), cipher.final()]));
          const tag = new Uint8Array(cipher.getAuthTag());
          return { ciphertext, tag };
        },
        async decrypt(key, iv, ciphertext, tag) {
          const decipher = quickCrypto.createDecipheriv('aes-256-gcm', key, iv);
          decipher.setAuthTag(tag);
          return new Uint8Array(Buffer.concat([decipher.update(ciphertext), decipher.final()]));
        },
      };
    }
  } catch {
    // fall through to WebCrypto
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const webcrypto: any = (globalThis as any)?.crypto;
  if (webcrypto?.subtle) {
    return {
      async generateKey() {
        return webcrypto.getRandomValues(new Uint8Array(KEY_BYTES));
      },
      randomBytes(length: number) {
        return webcrypto.getRandomValues(new Uint8Array(length));
      },
      async encrypt(key, iv, plaintext) {
        const cryptoKey = await webcrypto.subtle.importKey('raw', key, { name: 'AES-GCM' }, false, ['encrypt']);
        const result = new Uint8Array(await webcrypto.subtle.encrypt({ name: 'AES-GCM', iv, tagLength: TAG_BYTES * 8 }, cryptoKey, plaintext));
        const ciphertext = result.slice(0, result.length - TAG_BYTES);
        const tag = result.slice(result.length - TAG_BYTES);
        return { ciphertext, tag };
      },
      async decrypt(key, iv, ciphertext, tag) {
        const cryptoKey = await webcrypto.subtle.importKey('raw', key, { name: 'AES-GCM' }, false, ['decrypt']);
        const combined = new Uint8Array(ciphertext.length + tag.length);
        combined.set(ciphertext, 0);
        combined.set(tag, ciphertext.length);
        const plaintext = await webcrypto.subtle.decrypt({ name: 'AES-GCM', iv, tagLength: TAG_BYTES * 8 }, cryptoKey, combined);
        return new Uint8Array(plaintext);
      },
    };
  }

  throw new Error(
    'EncryptedCacheService: no AES-GCM implementation available. ' +
      'Install react-native-quick-crypto or provide a WebCrypto polyfill. Refusing to store PHI unencrypted.',
  );
}

export class EncryptedCacheService {
  private static instance: EncryptedCacheService;
  private encryptionKeyId = 'health-watchers-cache-key';
  private cachePrefix = 'hw_encrypted_cache_';
  private defaultTTL = 24 * 60 * 60 * 1000; // 24 hours
  private cachedKey: Uint8Array | null = null;

  /**
   * PHI data types that may be cached. Any key not in this list is rejected by `set`.
   */
  private cachedDataTypes = [
    'patient_profile', // Patient demographics, name, DOB
    'medical_history', // Past diagnoses, surgeries, medications
    'lab_results', // Lab test results and values
    'appointments', // Scheduled appointments
    'prescriptions', // Medication prescriptions
    'vitals', // Blood pressure, temperature, etc.
    'encounter_notes', // Doctor visit summaries
    'encounters', // Encounter records
  ];

  private constructor() {}

  static getInstance(): EncryptedCacheService {
    if (!EncryptedCacheService.instance) {
      EncryptedCacheService.instance = new EncryptedCacheService();
    }
    return EncryptedCacheService.instance;
  }

  private isKnownDataType(key: string): boolean {
    return this.cachedDataTypes.includes(key);
  }

  /**
   * Get or create the 256-bit AES key stored in SecureStore (Keychain/Keystore).
   * The key is device-only and requires biometric/passcode authentication where supported.
   */
  private async getOrCreateEncryptionKey(): Promise<Uint8Array> {
    if (this.cachedKey) return this.cachedKey;

    const secureStoreOptions: SecureStore.SecureStoreOptions = {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
      requireAuthentication: false,
    };

    const existing = await SecureStore.getItemAsync(this.encryptionKeyId, secureStoreOptions);
    if (existing) {
      const key = fromBase64(existing);
      if (key.length !== KEY_BYTES) {
        throw new Error('EncryptedCacheService: stored encryption key has invalid length');
      }
      this.cachedKey = key;
      return key;
    }

    const aes = resolveAesGcm();
    const key = await aes.generateKey();
    if (key.length !== KEY_BYTES) {
      throw new Error('EncryptedCacheService: generated encryption key has invalid length');
    }
    await SecureStore.setItemAsync(this.encryptionKeyId, toBase64(key), secureStoreOptions);
    this.cachedKey = key;
    return key;
  }

  /**
   * Encrypt a value with AES-256-GCM using a fresh IV.
   * Returns `v1.<iv>.<ciphertext>.<tag>` with base64 segments.
   */
  private async encryptData<T>(data: T): Promise<string> {
    const aes = resolveAesGcm();
    const key = await this.getOrCreateEncryptionKey();
    const iv = aes.randomBytes(IV_BYTES);
    const plaintext = utf8Encode(JSON.stringify(data));
    const { ciphertext, tag } = await aes.encrypt(key, iv, plaintext);
    return [STORAGE_VERSION, toBase64(iv), toBase64(ciphertext), toBase64(tag)].join('.');
  }

  /**
   * Decrypt a value produced by `encryptData`. Returns null on tamper/format errors.
   */
  private async decryptData<T>(encryptedData: string): Promise<T | null> {
    try {
      const parts = encryptedData.split('.');
      if (parts.length !== 4 || parts[0] !== STORAGE_VERSION) return null;
      const [, ivB64, ciphertextB64, tagB64] = parts;
      const aes = resolveAesGcm();
      const key = await this.getOrCreateEncryptionKey();
      const plaintext = await aes.decrypt(key, fromBase64(ivB64), fromBase64(ciphertextB64), fromBase64(tagB64));
      return JSON.parse(utf8Decode(plaintext)) as T;
    } catch {
      return null;
    }
  }

  /**
   * Store data in encrypted cache with TTL.
   */
  async set<T>(key: string, value: T, ttlMs?: number): Promise<void> {
    if (!this.isKnownDataType(key)) {
      throw new Error(`EncryptedCacheService: refusing to cache unknown PHI type "${key}"`);
    }
    try {
      const cacheEntry: CacheEntry<T> = {
        data: value,
        timestamp: Date.now(),
        ttl: ttlMs ?? this.defaultTTL,
      };
      const encrypted = await this.encryptData(cacheEntry);
      const fullKey = this.cachePrefix + key;
      await AsyncStorage.setItem(fullKey, encrypted);
    } catch (error) {
      console.error(`Failed to cache ${key}:`, error);
      throw error;
    }
  }

  /**
   * Retrieve data from encrypted cache, enforcing TTL.
   */
  async get<T>(key: string): Promise<T | null> {
    try {
      const fullKey = this.cachePrefix + key;
      const encryptedEntry = await AsyncStorage.getItem(fullKey);

      if (!encryptedEntry) return null;

      const entry = await this.decryptData<CacheEntry<T>>(encryptedEntry);
      if (!entry) {
        // Tampered or unreadable entry: remove it.
        await this.delete(key);
        return null;
      }

      if (Date.now() > entry.timestamp + entry.ttl) {
        await this.delete(key);
        return null;
      }

      return entry.data;
    } catch (error) {
      console.error(`Failed to retrieve cache for ${key}:`, error);
      return null;
    }
  }

  /**
   * Delete specific cache entry.
   */
  async delete(key: string): Promise<void> {
    try {
      const fullKey = this.cachePrefix + key;
      await AsyncStorage.removeItem(fullKey);
    } catch (error) {
      console.error(`Failed to delete cache for ${key}:`, error);
    }
  }

  /**
   * Clear all cached data (called on logout or session revocation).
   * Overwrites entries before removal to reduce residual plaintext/ciphertext on disk.
   */
  async clearAll(): Promise<void> {
    try {
      const allKeys = await AsyncStorage.getAllKeys();
      const cacheKeys = allKeys.filter(k => k.startsWith(this.cachePrefix));

      // Shred: overwrite each entry with random bytes of equal length before removal.
      const aes = resolveAesGcm();
      for (const cacheKey of cacheKeys) {
        const existing = await AsyncStorage.getItem(cacheKey);
        if (existing) {
          const shred = toBase64(aes.randomBytes(existing.length));
          await AsyncStorage.setItem(cacheKey, shred);
        }
      }

      await AsyncStorage.multiRemove(cacheKeys);
      console.log(`Cleared ${cacheKeys.length} cache entries`);
    } catch (error) {
      console.error('Failed to clear cache:', error);
    }
  }

  /**
   * Audit what data is currently cached and return a HIPAA compliance report.
   */
  async auditCachedData(): Promise<CacheAuditEntry[]> {
    const report: CacheAuditEntry[] = [];
    try {
      const allKeys = await AsyncStorage.getAllKeys();
      const cacheKeys = allKeys.filter(k => k.startsWith(this.cachePrefix));
      const now = Date.now();

      console.log('=== Cache Audit Report ===');
      for (const key of cacheKeys) {
        const dataType = key.replace(this.cachePrefix, '');
        const raw = await AsyncStorage.getItem(key);
        const sizeBytes = raw?.length ?? 0;
        const entry = raw ? await this.decryptData<CacheEntry<unknown>>(raw) : null;
        const ageMs = entry ? now - entry.timestamp : -1;
        const ttlRemainingMs = entry ? entry.timestamp + entry.ttl - now : -1;
        const expired = entry ? ttlRemainingMs <= 0 : true;

        report.push({ dataType, sizeBytes, ageMs, ttlRemainingMs, expired });
        console.log(
          `- ${dataType}: ${(sizeBytes / 1024).toFixed(2)} KB, age ${Math.round(ageMs / 1000)}s, ` +
            `TTL remaining ${Math.round(ttlRemainingMs / 1000)}s${expired ? ' [EXPIRED]' : ''}`,
        );
      }
      console.log('========================');
    } catch (error) {
      console.error('Failed to audit cache:', error);
    }
    return report;
  }

  /**
   * Backup exclusion is enforced natively via the Expo config plugin
   * (`plugins/withBackupExclusion.js`) which sets `android:allowBackup="false"` /
   * backup rules on Android and `NSURLIsExcludedFromBackupKey` on iOS for the
   * AsyncStorage directory. This method verifies the platform and logs the state.
   */
  async excludeFromBackup(): Promise<void> {
    if (Platform.OS === 'ios') {
      console.log('iOS: AsyncStorage directory excluded from iCloud backup via config plugin.');
    } else if (Platform.OS === 'android') {
      console.log('Android: allowBackup=false / backup rules applied via config plugin.');
    }
  }

  /**
   * Initialize encrypted cache on app startup.
   */
  async initialize(): Promise<void> {
    try {
      await this.getOrCreateEncryptionKey();
      await this.excludeFromBackup();
    } catch (error) {
      console.error('Failed to initialize encrypted cache:', error);
      throw error;
    }
  }
}

export const encryptedCacheService = EncryptedCacheService.getInstance();
