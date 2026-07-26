// Service Worker for Health Watchers PWA
const CACHE_NAME = 'health-watchers-v1';
const OFFLINE_URL = '/offline';
const SYNC_TAG = 'form-sync';

// Cache strategies
const CACHE_STRATEGIES = {
  STATIC: 'static-cache-v1',
  CLINICAL_DATA: 'clinical-data-cache-v1',
  API: 'api-cache-v1',
};

const STATIC_ASSETS = ['/', '/dashboard', '/offline', '/manifest.json'];

// Clinical data endpoints that should be cached for offline access
const CLINICAL_ENDPOINTS = ['/api/v1/patients', '/api/v1/encounters'];

// Install event - cache static assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    Promise.all([
      caches.open(CACHE_STRATEGIES.STATIC).then((cache) => {
        return cache.addAll(STATIC_ASSETS);
      }),
    ])
  );
  self.skipWaiting();
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          // Keep only current cache versions
          if (
            ![
              CACHE_STRATEGIES.STATIC,
              CACHE_STRATEGIES.CLINICAL_DATA,
              CACHE_STRATEGIES.API,
            ].includes(cacheName)
          ) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Fetch event - implement caching strategies
self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Skip non-GET requests
  if (request.method !== 'GET') {
    return;
  }

  const url = new URL(request.url);

  // Static assets - cache first
  if (
    request.destination === 'style' ||
    request.destination === 'script' ||
    request.destination === 'image' ||
    request.destination === 'font'
  ) {
    event.respondWith(cacheFirst(request, CACHE_STRATEGIES.STATIC));
    return;
  }

  // Clinical data endpoints - stale-while-revalidate
  if (CLINICAL_ENDPOINTS.some((endpoint) => url.pathname.startsWith(endpoint))) {
    event.respondWith(staleWhileRevalidate(request, CACHE_STRATEGIES.CLINICAL_DATA));
    return;
  }

  // Other API requests - network first with cache fallback
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(networkFirst(request, CACHE_STRATEGIES.API));
    return;
  }

  // Navigation requests - network first
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => {
        return caches.match(OFFLINE_URL);
      })
    );
    return;
  }

  // Default - network first
  event.respondWith(networkFirst(request, CACHE_STRATEGIES.API));
});

// Cache first strategy
async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) {
    return cached;
  }

  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return new Response('Offline', { status: 503 });
  }
}

// Network first strategy
async function networkFirst(request, cacheName) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    if (cached) {
      return cached;
    }
    return new Response(JSON.stringify({ success: false, error: 'Offline' }), {
      headers: { 'Content-Type': 'application/json' },
      status: 503,
    });
  }
}

// Stale-while-revalidate strategy
async function staleWhileRevalidate(request, cacheName) {
  const cached = await caches.match(request);

  // Return cached response immediately
  const fetchPromise = fetch(request).then((response) => {
    if (response.ok) {
      const cache = caches.open(cacheName);
      cache.then((c) => c.put(request, response.clone()));
    }
    return response;
  });

  return cached || fetchPromise;
}

// Background sync for form submissions
self.addEventListener('sync', (event) => {
  if (event.tag === SYNC_TAG) {
    event.waitUntil(syncPendingForms());
  }
});

async function syncPendingForms() {
  try {
    const db = await openIndexedDB();
    const pendingForms = await getAllPendingForms(db);

    for (const form of pendingForms) {
      try {
        const response = await fetch(form.url, {
          method: form.method,
          headers: form.headers,
          body: form.body,
        });

        if (response.ok) {
          await deletePendingForm(db, form.id);
          // Notify client of successful sync
          self.clients.matchAll().then((clients) => {
            clients.forEach((client) => {
              client.postMessage({
                type: 'FORM_SYNCED',
                formId: form.id,
              });
            });
          });
        }
      } catch (err) {
        console.error('Failed to sync form:', err);
      }
    }
  } catch (err) {
    console.error('Background sync error:', err);
  }
}

// IndexedDB helpers for offline form storage
function openIndexedDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('HealthWatchers', 1);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains('pendingForms')) {
        db.createObjectStore('pendingForms', { keyPath: 'id' });
      }
    };
  });
}

function getAllPendingForms(db) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['pendingForms'], 'readonly');
    const store = transaction.objectStore('pendingForms');
    const request = store.getAll();

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

function deletePendingForm(db, id) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['pendingForms'], 'readwrite');
    const store = transaction.objectStore('pendingForms');
    const request = store.delete(id);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
}

// Message handler for client communication
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }

  if (event.data && event.data.type === 'STORE_PENDING_FORM') {
    storePendingForm(event.data.form);
  }
});

function storePendingForm(form) {
  openIndexedDB().then((db) => {
    const transaction = db.transaction(['pendingForms'], 'readwrite');
    const store = transaction.objectStore('pendingForms');
    store.add({
      id: Date.now(),
      ...form,
    });
  });
}
