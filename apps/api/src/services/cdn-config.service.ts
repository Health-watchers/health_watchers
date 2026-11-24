/**
 * CdnConfigService — Issue #1078
 *
 * Centralises CDN configuration, cache-header generation, and delivery
 * performance monitoring for the Health Watchers platform.
 *
 * Supported providers: Cloudflare, AWS CloudFront, Fastly, custom.
 */

import logger from '../utils/logger';

export type CdnProvider = 'cloudflare' | 'cloudfront' | 'fastly' | 'custom' | 'none';

export interface CdnConfig {
  provider: CdnProvider;
  cdnUrl: string | null;
  cacheMaxAge: number;
  staleWhileRevalidate: number;
  monitoringEnabled: boolean;
  appVersion: string;
}

export interface CacheHeaders {
  'Cache-Control': string;
  'Surrogate-Control'?: string;
  'CDN-Cache-Control'?: string;
  Vary?: string;
}

export interface DeliveryMetrics {
  provider: CdnProvider;
  cacheHitRate: number;
  avgResponseTimeMs: number;
  totalRequests: number;
  cachedRequests: number;
  originRequests: number;
  bandwidthSavedBytes: number;
  measuredAt: Date;
}

/**
 * Singleton CDN configuration service.
 */
export class CdnConfigService {
  private static instance: CdnConfigService;
  private readonly config: CdnConfig;
  /** In-memory delivery metrics store (production would use a time-series DB) */
  private metrics: DeliveryMetrics;

  private constructor() {
    this.config = {
      provider: (process.env.NEXT_PUBLIC_CDN_PROVIDER as CdnProvider) || 'none',
      cdnUrl: process.env.NEXT_PUBLIC_CDN_URL || null,
      cacheMaxAge: parseInt(process.env.CDN_CACHE_MAX_AGE || '31536000', 10),
      staleWhileRevalidate: parseInt(process.env.CDN_STALE_WHILE_REVALIDATE || '86400', 10),
      monitoringEnabled: process.env.ENABLE_CDN_MONITORING === 'true',
      appVersion: process.env.NEXT_PUBLIC_APP_VERSION || '1.0.0',
    };

    this.metrics = {
      provider: this.config.provider,
      cacheHitRate: 0,
      avgResponseTimeMs: 0,
      totalRequests: 0,
      cachedRequests: 0,
      originRequests: 0,
      bandwidthSavedBytes: 0,
      measuredAt: new Date(),
    };

    logger.info(
      { provider: this.config.provider, cdnConfigured: !!this.config.cdnUrl },
      'CdnConfigService initialised'
    );
  }

  static getInstance(): CdnConfigService {
    if (!CdnConfigService.instance) {
      CdnConfigService.instance = new CdnConfigService();
    }
    return CdnConfigService.instance;
  }

  /** Return the current CDN configuration (read-only). */
  getConfig(): Readonly<CdnConfig> {
    return { ...this.config };
  }

  /** Returns true if a CDN URL is configured and the provider is not 'none'. */
  isCdnEnabled(): boolean {
    return !!this.config.cdnUrl && this.config.provider !== 'none';
  }

  /**
   * Generate appropriate Cache-Control and CDN-specific cache headers for a
   * given asset type.
   */
  getCacheHeaders(assetType: 'immutable' | 'page' | 'api' | 'no-cache'): CacheHeaders {
    const { cacheMaxAge, staleWhileRevalidate } = this.config;

    switch (assetType) {
      case 'immutable':
        return {
          'Cache-Control': `public, max-age=${cacheMaxAge}, immutable`,
          'Surrogate-Control': `max-age=${cacheMaxAge}`,
          'CDN-Cache-Control': `public, max-age=${cacheMaxAge}`,
        };

      case 'page':
        return {
          'Cache-Control': `public, max-age=0, s-maxage=3600, stale-while-revalidate=${staleWhileRevalidate}`,
          Vary: 'Accept-Encoding, Accept-Language',
        };

      case 'api':
        return {
          'Cache-Control': 'private, no-cache, no-store, must-revalidate',
        };

      case 'no-cache':
        return {
          'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
        };
    }
  }

  /**
   * Compute the full CDN URL for a given asset path.
   * Falls back to the path itself if CDN is not configured.
   */
  getCdnUrl(assetPath: string): string {
    if (!this.config.cdnUrl) return assetPath;
    const base = this.config.cdnUrl.replace(/\/$/, '');
    const path = assetPath.startsWith('/') ? assetPath : `/${assetPath}`;
    return `${base}${path}`;
  }

  /**
   * Record a delivery event for in-memory metrics aggregation.
   */
  recordDeliveryEvent(cacheHit: boolean, responseTimeMs: number, bytesSaved = 0): void {
    this.metrics.totalRequests++;
    if (cacheHit) {
      this.metrics.cachedRequests++;
      this.metrics.bandwidthSavedBytes += bytesSaved;
    } else {
      this.metrics.originRequests++;
    }
    // Running average
    this.metrics.avgResponseTimeMs =
      (this.metrics.avgResponseTimeMs * (this.metrics.totalRequests - 1) + responseTimeMs) /
      this.metrics.totalRequests;
    this.metrics.cacheHitRate =
      this.metrics.totalRequests > 0 ? this.metrics.cachedRequests / this.metrics.totalRequests : 0;
    this.metrics.measuredAt = new Date();
  }

  /** Return a snapshot of the current delivery metrics. */
  getDeliveryMetrics(): Readonly<DeliveryMetrics> {
    return { ...this.metrics };
  }

  /**
   * Build the CDN origin configuration object used by infrastructure-as-code
   * tools (e.g. Terraform, Pulumi) or CDN provider SDKs.
   */
  buildOriginConfig(): Record<string, unknown> {
    return {
      provider: this.config.provider,
      originUrl: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001',
      cdnUrl: this.config.cdnUrl,
      caching: {
        defaultMaxAge: this.config.cacheMaxAge,
        staleWhileRevalidate: this.config.staleWhileRevalidate,
        varyHeaders: ['Accept-Encoding', 'Accept-Language'],
      },
      compression: {
        gzip: true,
        brotli: true,
      },
      security: {
        httpsRedirect: true,
        minTlsVersion: 'TLSv1.2',
        hstsMaxAge: 31536000,
      },
    };
  }
}

export default CdnConfigService;
