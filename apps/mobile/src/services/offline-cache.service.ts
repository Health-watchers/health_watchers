import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo, { NetInfoState } from '@react-native-community/netinfo';
import { useQuery, useQueryClient } from 'react-query';
import { authService } from './auth.service';
import { EncryptedCacheService } from './encrypted-cache.service';

const CACHE_KEYS = {
  appointments: 'appointments',
  encounters: 'encounters',
  labResults: 'labResults',
  profile: 'profile',
  patients: 'patients',
  patientIndex: 'patientIndex',
  pendingSync: 'pendingSync',
};

/**
 * Legacy plaintext keys written by earlier versions of this service. These are
 * deleted on first launch after the upgrade (see migrateLegacyCache).
 */
const LEGACY_PLAINTEXT_KEYS = Object.values(CACHE_KEYS);

const MIGRATION_FLAG_KEY = 'offlineCache:legacyMigration:v1';

/** Maximum age (ms) of a cached entry before it is treated as expired. */
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

const MAX_CACHED_PATIENTS = 50;

interface CacheEnvelope<T> {
  data: T;
  cachedAt: number;
}

export interface CachedResult<T> {
  data: T;
  /** True when the data was served from AsyncStorage and may be stale. */
  isCached: boolean;
  /** Timestamp (ms) when the cached data was written, if cached. */
  cachedAt?: number;
}

export interface CachedPatientRecord {
  patient: any;
  encounters: any[];
  cachedAt: number;
}

export interface FieldDiff {
  field: string;
  cached: any;
  server: any;
}

export interface ConflictDiff {
  patientId: string;
  fields: FieldDiff[];
}

export interface SyncResult {
  synced: number;
  conflicts: ConflictDiff[];
}

function patientKey(patientId: string): string {
  return `${CACHE_KEYS.patients}:${patientId}`;
}

function encounterKey(patientId: string): string {
  return `${CACHE_KEYS.encounters}:${patientId}`;
}

function isExpired(cachedAt: number | undefined): boolean {
  if (!cachedAt) return true;
  return Date.now() - cachedAt > CACHE_TTL_MS;
}

/**
 * Read a value from the encrypted cache, enforcing the TTL. Expired entries are
 * removed and null is returned.
 */
async function readEncrypted<T>(key: string): Promise<T | null> {
  const envelope = await EncryptedCacheService.get<CacheEnvelope<T>>(key);
  if (!envelope) return null;
  if (isExpired(envelope.cachedAt)) {
    await EncryptedCacheService.remove(key);
    return null;
  }
  return envelope.data;
}

/**
 * Write a value to the encrypted cache wrapped in a timestamped envelope.
 */
async function writeEncrypted<T>(key: string, data: T): Promise<void> {
  const envelope: CacheEnvelope<T> = { data, cachedAt: Date.now() };
  await EncryptedCacheService.set(key, envelope);
}

function shallowDiff(cached: any, server: any): FieldDiff[] {
  const diffs: FieldDiff[] = [];
  const keys = new Set([...Object.keys(cached || {}), ...Object.keys(server || {})]);
  keys.forEach((field) => {
    const a = cached ? cached[field] : undefined;
    const b = server ? server[field] : undefined;
    if (JSON.stringify(a) !== JSON.stringify(b)) {
      diffs.push({ field, cached: a, server: b });
    }
  });
  return diffs;
}

export class OfflineCacheService {
  private static syncInProgress = false;
  private static unsubscribeNetInfo: (() => void) | null = null;

  static async cacheAppointments(appointments: any[]): Promise<void> {
    await writeEncrypted(CACHE_KEYS.appointments, appointments);
  }

  static async getCachedAppointments(): Promise<any[]> {
    const cached = await readEncrypted<any[]>(CACHE_KEYS.appointments);
    return cached || [];
  }

  static async cacheEncounters(encounters: any[]): Promise<void> {
    await writeEncrypted(CACHE_KEYS.encounters, encounters);
  }

  static async getCachedEncounters(): Promise<any[]> {
    const cached = await readEncrypted<any[]>(CACHE_KEYS.encounters);
    return cached || [];
  }

  static async cacheLabResults(results: any[]): Promise<void> {
    await writeEncrypted(CACHE_KEYS.labResults, results);
  }

  static async getCachedLabResults(): Promise<any[]> {
    const cached = await readEncrypted<any[]>(CACHE_KEYS.labResults);
    return cached || [];
  }

  /**
   * Cache a viewed patient record along with its encounters. Keeps only the
   * last MAX_CACHED_PATIENTS viewed patients (most recent first).
   */
  static async cachePatientRecord(patient: any, encounters: any[] = []): Promise<void> {
    if (!patient || !patient.id) return;
    const patientId = String(patient.id);
    const record: CachedPatientRecord = {
      patient,
      encounters,
      cachedAt: Date.now(),
    };

    const index = (await readEncrypted<string[]>(CACHE_KEYS.patientIndex)) || [];
    const nextIndex = [patientId, ...index.filter((id) => id !== patientId)].slice(
      0,
      MAX_CACHED_PATIENTS
    );
    const evicted = index.filter((id) => !nextIndex.includes(id));

    await writeEncrypted(patientKey(patientId), record);
    await writeEncrypted(CACHE_KEYS.patientIndex, nextIndex);

    if (evicted.length > 0) {
      await EncryptedCacheService.removeMany(
        evicted.flatMap((id) => [patientKey(id), encounterKey(id)])
      );
    }
  }

  static async getCachedPatientRecord(patientId: string): Promise<CachedPatientRecord | null> {
    return readEncrypted<CachedPatientRecord>(patientKey(String(patientId)));
  }

  static async getCachedPatientIds(): Promise<string[]> {
    const ids = await readEncrypted<string[]>(CACHE_KEYS.patientIndex);
    return ids || [];
  }

  static async getCachedPatients(): Promise<CachedPatientRecord[]> {
    const ids = await this.getCachedPatientIds();
    const records = await Promise.all(ids.map((id) => this.getCachedPatientRecord(id)));
    return records.filter((r): r is CachedPatientRecord => r !== null);
  }

  /**
   * Queue a mutation (e.g. a patient/encounter update made offline) to be
   * replayed when connectivity is restored.
   */
  static async queuePendingSync(item: any): Promise<void> {
    const queue = (await readEncrypted<any[]>(CACHE_KEYS.pendingSync)) || [];
    queue.push({ ...item, queuedAt: Date.now() });
    await writeEncrypted(CACHE_KEYS.pendingSync, queue);
  }

  static async getPendingSync(): Promise<any[]> {
    const queue = await readEncrypted<any[]>(CACHE_KEYS.pendingSync);
    return queue || [];
  }

  /**
   * Reconcile cached patient records against server data. Returns a diff for
   * every patient whose server data differs from the cached copy.
   */
  static async reconcilePatients(serverPatients: any[]): Promise<SyncResult> {
    const cached = await this.getCachedPatients();
    const conflicts: ConflictDiff[] = [];
    let synced = 0;

    for (const record of cached) {
      const server = serverPatients.find(
        (p) => String(p.id) === String(record.patient.id)
      );
      if (!server) continue;
      const fields = shallowDiff(record.patient, server);
      if (fields.length > 0) {
        conflicts.push({ patientId: String(record.patient.id), fields });
      } else {
        synced += 1;
      }
    }

    return { synced, conflicts };
  }

  /**
   * Sync strategy on reconnect: flush the pending mutation queue, then refresh
   * cached patient records from the server and report conflicts.
   */
  static async syncOnReconnect(): Promise<SyncResult> {
    if (this.syncInProgress) {
      return { synced: 0, conflicts: [] };
    }
    this.syncInProgress = true;
    try {
      const api = authService.getApiClient();
      const pending = await this.getPendingSync();
      for (const item of pending) {
        try {
          await api.request(item.request);
        } catch {
          // Leave failed items in the queue for the next sync attempt.
          return { synced: 0, conflicts: [] };
        }
      }
      await EncryptedCacheService.remove(CACHE_KEYS.pendingSync);

      const response = await api.get('/patients');
      const serverPatients = response.data.data || [];
      const result = await this.reconcilePatients(serverPatients);

      for (const patient of serverPatients) {
        const cached = await this.getCachedPatientRecord(String(patient.id));
        if (cached) {
          await this.cachePatientRecord(patient, cached.encounters);
        }
      }

      return result;
    } finally {
      this.syncInProgress = false;
    }
  }

  /**
   * Subscribe to connectivity changes and trigger syncOnReconnect when the
   * device comes back online. Returns an unsubscribe function.
   */
  static startConnectivityListener(
    onSync?: (result: SyncResult) => void
  ): () => void {
    if (this.unsubscribeNetInfo) {
      return this.unsubscribeNetInfo;
    }
    let wasOffline = false;
    const handler = (state: NetInfoState) => {
      const online = state.isConnected === true && state.isInternetReachable !== false;
      if (!online) {
        wasOffline = true;
        return;
      }
      if (wasOffline) {
        wasOffline = false;
        this.syncOnReconnect()
          .then((result) => onSync && onSync(result))
          .catch(() => undefined);
      }
    };
    const unsubscribe = NetInfo.addEventListener(handler);
    this.unsubscribeNetInfo = () => {
      unsubscribe();
      this.unsubscribeNetInfo = null;
    };
    return this.unsubscribeNetInfo;
  }

  static stopConnectivityListener(): void {
    if (this.unsubscribeNetInfo) {
      this.unsubscribeNetInfo();
    }
  }

  /**
   * Wipe all cached PHI. Called on logout and when device-integrity checks
   * fail. Also removes any legacy plaintext keys that may still exist.
   */
  static async clearCache(): Promise<void> {
    const ids = await this.getCachedPatientIds();
    await EncryptedCacheService.removeMany([
      ...Object.values(CACHE_KEYS),
      ...ids.flatMap((id) => [patientKey(id), encounterKey(id)]),
    ]);
    await this.removeLegacyPlaintextKeys();
  }

  /**
   * Wipe the cache in response to a logout event.
   */
  static async wipeOnLogout(): Promise<void> {
    await this.clearCache();
  }

  /**
   * Wipe the cache when a device-integrity check fails (e.g. rooted/jailbroken
   * device detected).
   */
  static async wipeOnIntegrityFailure(): Promise<void> {
    await this.clearCache();
  }

  /**
   * Delete legacy plaintext cache keys written by earlier versions. Safe to
   * call repeatedly; the migration flag prevents redundant work.
   */
  static async migrateLegacyCache(): Promise<void> {
    const migrated = await AsyncStorage.getItem(MIGRATION_FLAG_KEY);
    if (migrated === 'true') return;
    await this.removeLegacyPlaintextKeys();
    await AsyncStorage.setItem(MIGRATION_FLAG_KEY, 'true');
  }

  private static async removeLegacyPlaintextKeys(): Promise<void> {
    const allKeys = await AsyncStorage.getAllKeys();
    const legacyKeys = allKeys.filter(
      (key) =>
        LEGACY_PLAINTEXT_KEYS.includes(key) ||
        key.startsWith(`${CACHE_KEYS.patients}:`) ||
        key.startsWith(`${CACHE_KEYS.encounters}:`)
    );
    if (legacyKeys.length > 0) {
      await AsyncStorage.multiRemove(legacyKeys);
    }
  }
}

export function useAppointmentsWithCache() {
  const queryClient = useQueryClient();

  return useQuery(
    ['appointments'],
    async () => {
      try {
        const api = authService.getApiClient();
        const response = await api.get('/appointments');
        await OfflineCacheService.cacheAppointments(response.data.data);
        return response.data.data;
      } catch (error) {
        // Return cached data on error
        return OfflineCacheService.getCachedAppointments();
      }
    },
    {
      staleTime: 5 * 60 * 1000, // 5 minutes
      cacheTime: 30 * 60 * 1000, // 30 minutes
    }
  );
}

export function useEncountersWithCache() {
  return useQuery(
    ['encounters'],
    async () => {
      try {
        const api = authService.getApiClient();
        const response = await api.get('/encounters');
        await OfflineCacheService.cacheEncounters(response.data.data);
        return response.data.data;
      } catch (error) {
        return OfflineCacheService.getCachedEncounters();
      }
    },
    {
      staleTime: 5 * 60 * 1000,
      cacheTime: 30 * 60 * 1000,
    }
  );
}

/**
 * Fetch a patient record (with encounters) with offline fallback. The result
 * carries an `isCached` flag so the UI can render a "cached" badge when the
 * data may be stale.
 */
export function usePatientRecordWithCache(patientId: string) {
  return useQuery<CachedResult<CachedPatientRecord | null>>(
    ['patient', patientId],
    async () => {
      try {
        const api = authService.getApiClient();
        const [patientRes, encountersRes] = await Promise.all([
          api.get(`/patients/${patientId}`),
          api.get(`/patients/${patientId}/encounters`),
        ]);
        const patient = patientRes.data.data;
        const encounters = encountersRes.data.data || [];
        await OfflineCacheService.cachePatientRecord(patient, encounters);
        return { data: { patient, encounters, cachedAt: Date.now() }, isCached: false };
      } catch (error) {
        const cached = await OfflineCacheService.getCachedPatientRecord(patientId);
        return {
          data: cached,
          isCached: true,
          cachedAt: cached ? cached.cachedAt : undefined,
        };
      }
    },
    {
      staleTime: 5 * 60 * 1000,
      cacheTime: 30 * 60 * 1000,
    }
  );
}
