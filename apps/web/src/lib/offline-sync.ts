// Offline form submission and sync utility

interface PendingForm {
  id: string;
  url: string;
  method: 'POST' | 'PUT' | 'PATCH';
  headers: Record<string, string>;
  body: string;
  timestamp: number;
}

export class OfflineSync {
  private static db: IDBDatabase | null = null;

  static async init() {
    return new Promise<void>((resolve, reject) => {
      const request = indexedDB.open('HealthWatchers', 1);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains('pendingForms')) {
          db.createObjectStore('pendingForms', { keyPath: 'id' });
        }
      };
    });
  }

  static async storePendingForm(form: Omit<PendingForm, 'id' | 'timestamp'>) {
    if (!this.db) await this.init();

    return new Promise<void>((resolve, reject) => {
      const transaction = this.db!.transaction(['pendingForms'], 'readwrite');
      const store = transaction.objectStore('pendingForms');
      const request = store.add({
        id: `${Date.now()}-${Math.random()}`,
        ...form,
        timestamp: Date.now(),
      });

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        // Notify service worker to sync
        if ('serviceWorker' in navigator && 'SyncManager' in window) {
          navigator.serviceWorker.ready.then((registration) => {
            (registration as any).sync.register('form-sync');
          });
        }
        resolve();
      };
    });
  }

  static async getPendingForms(): Promise<PendingForm[]> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['pendingForms'], 'readonly');
      const store = transaction.objectStore('pendingForms');
      const request = store.getAll();

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
  }

  static async deletePendingForm(id: string) {
    if (!this.db) await this.init();

    return new Promise<void>((resolve, reject) => {
      const transaction = this.db!.transaction(['pendingForms'], 'readwrite');
      const store = transaction.objectStore('pendingForms');
      const request = store.delete(id);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  static async clearAllPendingForms() {
    if (!this.db) await this.init();

    return new Promise<void>((resolve, reject) => {
      const transaction = this.db!.transaction(['pendingForms'], 'readwrite');
      const store = transaction.objectStore('pendingForms');
      const request = store.clear();

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }
}

// Hook for monitoring offline status
export function useOnlineStatus() {
  const [isOnline, setIsOnline] = React.useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );

  React.useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return isOnline;
}

// Hook for listening to service worker messages
export function useServiceWorkerMessage(callback: (data: any) => void) {
  React.useEffect(() => {
    if ('serviceWorker' in navigator) {
      const handleMessage = (event: MessageEvent) => {
        callback(event.data);
      };

      navigator.serviceWorker.addEventListener('message', handleMessage);

      return () => {
        navigator.serviceWorker.removeEventListener('message', handleMessage);
      };
    }
  }, [callback]);
}
