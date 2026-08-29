import { openDB, DBSchema, IDBPDatabase } from 'idb';

export interface OfflineRequest {
  id: string;
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: string;
  timestamp: number;
  retryCount: number;
}

interface OfflineDB extends DBSchema {
  requests: {
    key: string;
    value: OfflineRequest;
    indexes: { 'by-timestamp': number };
  };
}

let db: IDBPDatabase<OfflineDB> | null = null;

async function getDB(): Promise<IDBPDatabase<OfflineDB>> {
  if (!db) {
    db = await openDB<OfflineDB>('offline-sync', 1, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('requests')) {
          const store = db.createObjectStore('requests', { keyPath: 'id' });
          store.createIndex('by-timestamp', 'timestamp');
        }
      },
    });
  }
  return db;
}

export async function addToSyncQueue(request: Omit<OfflineRequest, 'id' | 'timestamp' | 'retryCount'>): Promise<string> {
  const database = await getDB();
  const id = `${Date.now()}-${Math.random()}`;
  const offlineRequest: OfflineRequest = {
    ...request,
    id,
    timestamp: Date.now(),
    retryCount: 0,
  };
  await database.add('requests', offlineRequest);
  return id;
}

export async function getSyncQueue(): Promise<OfflineRequest[]> {
  const database = await getDB();
  const index = database.transaction('requests').store.index('by-timestamp');
  return index.getAll();
}

export async function removeFromSyncQueue(id: string): Promise<void> {
  const database = await getDB();
  await database.delete('requests', id);
}

export async function updateRetryCount(id: string, newCount: number): Promise<void> {
  const database = await getDB();
  const request = await database.get('requests', id);
  if (request) {
    request.retryCount = newCount;
    await database.put('requests', request);
  }
}

export async function clearSyncQueue(): Promise<void> {
  const database = await getDB();
  await database.clear('requests');
}

export async function syncPendingRequests(onProgress?: (status: string) => void): Promise<void> {
  const queue = await getSyncQueue();

  for (const request of queue) {
    onProgress?.(`Syncing ${request.method} ${request.url}`);

    try {
      const response = await fetch(request.url, {
        method: request.method,
        headers: request.headers,
        body: request.body ? JSON.parse(request.body) : undefined,
      });

      if (response.ok) {
        await removeFromSyncQueue(request.id);
      } else if (request.retryCount < 3) {
        await updateRetryCount(request.id, request.retryCount + 1);
      }
    } catch (error) {
      if (request.retryCount < 3) {
        await updateRetryCount(request.id, request.retryCount + 1);
      }
    }
  }

  onProgress?.('Sync complete');
}
