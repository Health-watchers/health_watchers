/**
 * CDN Integration and Caching Utilities
 * Handles CDN configuration, cache invalidation, and asset serving
 */

import { webConfig } from './config';

export interface CDNConfig {
  url: string;
  provider: 'cloudflare' | 'cloudfront' | 'fastly' | 'custom';
  apiKey?: string;
  zoneId?: string;
  distributionId?: string;
  cacheMaxAge: number;
  staleWhileRevalidate: number;
}

export const CDN_CONFIG: CDNConfig = {
  url: webConfig.cdn.url,
  provider: webConfig.cdn.provider,
  apiKey: webConfig.cdn.apiKey,
  zoneId: webConfig.cdn.cloudflareZoneId,
  distributionId: webConfig.cdn.cloudfrontDistributionId,
  cacheMaxAge: webConfig.cdn.cacheMaxAge,
  staleWhileRevalidate: webConfig.cdn.staleWhileRevalidate,
};

/**
 * Get the full CDN URL for an asset
 * Falls back to relative path if CDN is not configured
 */
export const getCDNUrl = (path: string): string => {
  if (!CDN_CONFIG.url) return path;
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return `${CDN_CONFIG.url}${cleanPath}`;
};

/**
 * Cache invalidation for different CDN providers
 */
export const invalidateCache = async (paths: string[]): Promise<void> => {
  if (!CDN_CONFIG.apiKey) {
    console.warn('[CDN] Cache invalidation skipped - no API key configured');
    return;
  }

  try {
    switch (CDN_CONFIG.provider) {
      case 'cloudflare':
        await invalidateCloudflareCache(paths);
        break;
      case 'cloudfront':
        await invalidateCloudFrontCache(paths);
        break;
      case 'fastly':
        await invalidateFastlyCache(paths);
        break;
      default:
        console.warn(`[CDN] Cache invalidation not implemented for provider: ${CDN_CONFIG.provider}`);
    }
  } catch (error) {
    console.error('[CDN] Cache invalidation failed:', error);
  }
};

/**
 * Invalidate Cloudflare cache
 */
const invalidateCloudflareCache = async (paths: string[]): Promise<void> => {
  if (!CDN_CONFIG.zoneId) {
    throw new Error('Cloudflare Zone ID not configured');
  }

  const response = await fetch(
    `https://api.cloudflare.com/client/v4/zones/${CDN_CONFIG.zoneId}/purge_cache`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${CDN_CONFIG.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        files: paths.map((p) => `${CDN_CONFIG.url}${p}`),
      }),
    },
  );

  if (!response.ok) {
    throw new Error(`Cloudflare cache invalidation failed: ${response.statusText}`);
  }
};

/**
 * Invalidate CloudFront cache
 */
const invalidateCloudFrontCache = async (paths: string[]): Promise<void> => {
  // This would require AWS SDK or direct API call
  // Implementation depends on your AWS setup
  console.log('[CDN] CloudFront invalidation requires AWS SDK setup');
};

/**
 * Invalidate Fastly cache
 */
const invalidateFastlyCache = async (paths: string[]): Promise<void> => {
  const response = await fetch(`https://api.fastly.com/purge`, {
    method: 'POST',
    headers: {
      'Fastly-Key': CDN_CONFIG.apiKey!,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      urls: paths.map((p) => `${CDN_CONFIG.url}${p}`),
    }),
  });

  if (!response.ok) {
    throw new Error(`Fastly cache invalidation failed: ${response.statusText}`);
  }
};

/**
 * Get cache control header based on asset type
 */
export const getCacheControlHeader = (
  filePath: string,
): { 'Cache-Control': string; 'Content-Type'?: string } => {
  // Immutable assets (hashed filenames)
  if (/\.[a-f0-9]{8,}\.(js|css|woff2?|ttf|eot)$/i.test(filePath)) {
    return {
      'Cache-Control': `public, max-age=${CDN_CONFIG.cacheMaxAge}, immutable`,
    };
  }

  // HTML files
  if (/\.html?$/i.test(filePath)) {
    return {
      'Cache-Control': 'public, max-age=3600, must-revalidate',
    };
  }

  // Images
  if (/\.(jpg|jpeg|png|gif|webp|svg)$/i.test(filePath)) {
    return {
      'Cache-Control': `public, max-age=2592000, stale-while-revalidate=${CDN_CONFIG.staleWhileRevalidate}`,
    };
  }

  // Default
  return {
    'Cache-Control': `public, max-age=3600, stale-while-revalidate=${CDN_CONFIG.staleWhileRevalidate}`,
  };
};

/**
 * Monitor CDN performance and cache hit rates
 */
export interface CDNMetrics {
  cacheHitRate: number;
  totalRequests: number;
  cachedRequests: number;
  originRequests: number;
  avgResponseTime: number;
}

export const reportCDNMetrics = async (): Promise<CDNMetrics | null> => {
  if (!CDN_CONFIG.apiKey) {
    return null;
  }

  try {
    switch (CDN_CONFIG.provider) {
      case 'cloudflare':
        return await getCloudflareMetrics();
      default:
        return null;
    }
  } catch (error) {
    console.error('[CDN] Failed to fetch metrics:', error);
    return null;
  }
};

const getCloudflareMetrics = async (): Promise<CDNMetrics | null> => {
  if (!CDN_CONFIG.zoneId) return null;

  // Implementation would fetch metrics from Cloudflare Analytics Engine
  // This is a placeholder - actual implementation would query the API
  return {
    cacheHitRate: 0.85,
    totalRequests: 0,
    cachedRequests: 0,
    originRequests: 0,
    avgResponseTime: 0,
  };
};

/**
 * Generate versioned asset URL for cache busting
 */
export const getVersionedAssetUrl = (
  path: string,
  version: string = webConfig.app.version,
): string => {
  const cdnUrl = getCDNUrl(path);
  const separator = cdnUrl.includes('?') ? '&' : '?';
  return `${cdnUrl}${separator}v=${version}`;
};
