import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo, { NetInfoState } from '@react-native-community/netinfo';
import { useQuery, useQueryClient } from 'react-query';
import { authService } from './auth.service';

const CACHE_KEYS = {
  appointments: 'appointments',
  encounters: 'encounters',
  labResults: 'labResults',
  profile: 'profile',
  patients: 'patients',
  patientIndex: 'patientIndex',
  pendingSync: 'pendingSync',
};

const MAX_CACHED_PATIENTS = 50;

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
    await AsyncStorage.setItem(CACHE_KEYS.appointments, JSON.stringify(appointments));
  }

  static async getCachedAppointments(): Promise<any[]> {
    const cached = await AsyncStorage.getItem(CACHE_KEYS.appointments);
    return cached ? JSON.parse(cached) : [];
  }

  static async cacheEncounters(encounters: any[]): Promise<void> {
    await AsyncStorage.setItem(CACHE_KEYS.encounters, JSON.stringify(encounters));
  }

  static async getCachedEncounters(): Promise<any[]> {
    const cached = await AsyncStorage.getItem(CACHE_KEYS.encounters);
    return cached ? JSON.parse(cached) : [];
  }

  static async cacheLabResults(results: any[]): Promise<void> {
    await AsyncStorage.setItem(CACHE_KEYS.labResults, JSON.stringify(results));
  }

  static async getCachedLabResults(): Promise<any[]> {
    const cached = await AsyncStorage.getItem(CACHE_KEYS.labResults);
    return cached ? JSON.parse(cached) : [];
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

    const indexRaw = await AsyncStorage.getItem(CACHE_KEYS.patientIndex);
    const index: string[] = indexRaw ? JSON.parse(indexRaw) : [];
    const nextIndex = [patientId, ...index.filter((id) => id !== patientId)].slice(
      0,
      MAX_CACHED_PATIENTS
    );
    const evicted = index.filter((id) => !nextIndex.includes(id));

    const writes: [string, string][] = [
      [patientKey(patientId), JSON.stringify(record)],
      [CACHE_KEYS.patientIndex, JSON.stringify(nextIndex)],
    ];
    await AsyncStorage.multiSet(writes);

    if (evicted.length > 0) {
      await AsyncStorage.multiRemove(
        evicted.flatMap((id) => [patientKey(id), encounterKey(id)])
      );
    }
  }

  static async getCachedPatientRecord(patientId: string): Promise<CachedPatientRecord | null> {
    const raw = await AsyncStorage.getItem(patientKey(String(patientId)));
    return raw ? JSON.parse(raw) : null;
  }

  static async getCachedPatientIds(): Promise<string[]> {
    const raw = await AsyncStorage.getItem(CACHE_KEYS.patientIndex);
    return raw ? JSON.parse(raw) : [];
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
    const raw = await AsyncStorage.getItem(CACHE_KEYS.pendingSync);
    const queue = raw ? JSON.parse(raw) : [];
    queue.push({ ...item, queuedAt: Date.now() });
    await AsyncStorage.setItem(CACHE_KEYS.pendingSync, JSON.stringify(queue));
  }

  static async getPendingSync(): Promise<any[]> {
    const raw = await AsyncStorage.getItem(CACHE_KEYS.pendingSync);
    return raw ? JSON.parse(raw) : [];
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
      await AsyncStorage.removeItem(CACHE_KEYS.pendingSync);

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

  static async clearCache(): Promise<void> {
    const ids = await this.getCachedPatientIds();
    await AsyncStorage.multiRemove([
      ...Object.values(CACHE_KEYS),
      ...ids.flatMap((id) => [patientKey(id), encounterKey(id)]),
    ]);
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
