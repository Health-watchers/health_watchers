export const CACHE_NAMES = {
  STATIC: 'hw-static-v1',
  DYNAMIC: 'hw-dynamic-v1',
  API: 'hw-api-v1',
  IMAGES: 'hw-images-v1',
} as const;

export const OFFLINE_ROUTES = ['/', '/appointments', '/patients', '/wallet', '/health', '/offline'];

export const CACHE_STRATEGIES = {
  CACHE_FIRST: 'cache-first' as const,
  NETWORK_FIRST: 'network-first' as const,
  NETWORK_ONLY: 'network-only' as const,
  CACHE_ONLY: 'cache-only' as const,
  STALE_WHILE_REVALIDATE: 'stale-while-revalidate' as const,
};

export async function cacheAssets(cacheName: string, urls: string[]): Promise<void> {
  const cache = await caches.open(cacheName);
  await cache.addAll(urls);
}

export async function getCachedResponse(
  cacheName: string,
  request: Request
): Promise<Response | undefined> {
  const cache = await caches.open(cacheName);
  return cache.match(request);
}

export async function setCacheResponse(
  cacheName: string,
  request: Request,
  response: Response
): Promise<void> {
  const cache = await caches.open(cacheName);
  cache.put(request, response.clone());
}

export async function cleanupOldCaches(excludeNames: string[]): Promise<void> {
  const cacheNames = await caches.keys();
  await Promise.all(
    cacheNames.filter((name) => !excludeNames.includes(name)).map((name) => caches.delete(name))
  );
}
