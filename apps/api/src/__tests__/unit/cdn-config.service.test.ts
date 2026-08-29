/**
 * Unit tests for CdnConfigService — Issue #1078
 */

jest.mock('../../utils/logger', () => ({
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { CdnConfigService } from '../../services/cdn-config.service';

function resetSingleton() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (CdnConfigService as any).instance = undefined;
}

beforeEach(() => {
  resetSingleton();
  // Clear CDN env vars
  delete process.env.NEXT_PUBLIC_CDN_URL;
  delete process.env.NEXT_PUBLIC_CDN_PROVIDER;
  delete process.env.CDN_CACHE_MAX_AGE;
  delete process.env.ENABLE_CDN_MONITORING;
});

afterEach(() => {
  resetSingleton();
});

describe('CdnConfigService', () => {
  describe('getInstance()', () => {
    it('returns the same singleton instance', () => {
      const a = CdnConfigService.getInstance();
      const b = CdnConfigService.getInstance();
      expect(a).toBe(b);
    });
  });

  describe('isCdnEnabled()', () => {
    it('returns false when NEXT_PUBLIC_CDN_URL is not set', () => {
      const svc = CdnConfigService.getInstance();
      expect(svc.isCdnEnabled()).toBe(false);
    });

    it('returns true when NEXT_PUBLIC_CDN_URL and provider are set', () => {
      resetSingleton();
      process.env.NEXT_PUBLIC_CDN_URL = 'https://cdn.example.com';
      process.env.NEXT_PUBLIC_CDN_PROVIDER = 'cloudflare';
      const svc = CdnConfigService.getInstance();
      expect(svc.isCdnEnabled()).toBe(true);
    });
  });

  describe('getConfig()', () => {
    it('returns default values when env vars are missing', () => {
      const svc = CdnConfigService.getInstance();
      const config = svc.getConfig();
      expect(config.provider).toBe('none');
      expect(config.cacheMaxAge).toBe(31536000);
      expect(config.staleWhileRevalidate).toBe(86400);
    });

    it('reads env vars correctly', () => {
      resetSingleton();
      process.env.NEXT_PUBLIC_CDN_URL = 'https://cdn.test.com';
      process.env.NEXT_PUBLIC_CDN_PROVIDER = 'cloudfront';
      process.env.CDN_CACHE_MAX_AGE = '7200';
      process.env.ENABLE_CDN_MONITORING = 'true';

      const svc = CdnConfigService.getInstance();
      const config = svc.getConfig();

      expect(config.provider).toBe('cloudfront');
      expect(config.cdnUrl).toBe('https://cdn.test.com');
      expect(config.cacheMaxAge).toBe(7200);
      expect(config.monitoringEnabled).toBe(true);
    });
  });

  describe('getCacheHeaders()', () => {
    it('returns immutable headers for immutable assets', () => {
      const svc = CdnConfigService.getInstance();
      const headers = svc.getCacheHeaders('immutable');
      expect(headers['Cache-Control']).toContain('immutable');
      expect(headers['Cache-Control']).toContain('public');
    });

    it('returns private no-cache headers for API responses', () => {
      const svc = CdnConfigService.getInstance();
      const headers = svc.getCacheHeaders('api');
      expect(headers['Cache-Control']).toContain('private');
      expect(headers['Cache-Control']).toContain('no-store');
    });

    it('includes Vary header for page assets', () => {
      const svc = CdnConfigService.getInstance();
      const headers = svc.getCacheHeaders('page');
      expect(headers.Vary).toContain('Accept-Encoding');
    });

    it('returns no-store for no-cache type', () => {
      const svc = CdnConfigService.getInstance();
      const headers = svc.getCacheHeaders('no-cache');
      expect(headers['Cache-Control']).toContain('no-store');
    });
  });

  describe('getCdnUrl()', () => {
    it('returns the path as-is when CDN is not configured', () => {
      const svc = CdnConfigService.getInstance();
      expect(svc.getCdnUrl('/static/logo.png')).toBe('/static/logo.png');
    });

    it('prepends CDN base URL when configured', () => {
      resetSingleton();
      process.env.NEXT_PUBLIC_CDN_URL = 'https://cdn.example.com';
      process.env.NEXT_PUBLIC_CDN_PROVIDER = 'cloudflare';
      const svc = CdnConfigService.getInstance();
      expect(svc.getCdnUrl('/static/logo.png')).toBe('https://cdn.example.com/static/logo.png');
    });

    it('handles missing leading slash in asset path', () => {
      resetSingleton();
      process.env.NEXT_PUBLIC_CDN_URL = 'https://cdn.example.com';
      process.env.NEXT_PUBLIC_CDN_PROVIDER = 'cloudflare';
      const svc = CdnConfigService.getInstance();
      expect(svc.getCdnUrl('fonts/roboto.woff2')).toBe(
        'https://cdn.example.com/fonts/roboto.woff2'
      );
    });

    it('strips trailing slash from base CDN URL', () => {
      resetSingleton();
      process.env.NEXT_PUBLIC_CDN_URL = 'https://cdn.example.com/';
      process.env.NEXT_PUBLIC_CDN_PROVIDER = 'cloudflare';
      const svc = CdnConfigService.getInstance();
      expect(svc.getCdnUrl('/img/hero.jpg')).toBe('https://cdn.example.com/img/hero.jpg');
    });
  });

  describe('recordDeliveryEvent() / getDeliveryMetrics()', () => {
    it('tracks cache hits and misses correctly', () => {
      const svc = CdnConfigService.getInstance();
      svc.recordDeliveryEvent(true, 50, 1024);
      svc.recordDeliveryEvent(true, 60, 2048);
      svc.recordDeliveryEvent(false, 200);

      const metrics = svc.getDeliveryMetrics();
      expect(metrics.totalRequests).toBe(3);
      expect(metrics.cachedRequests).toBe(2);
      expect(metrics.originRequests).toBe(1);
      expect(metrics.bandwidthSavedBytes).toBe(3072);
      expect(metrics.cacheHitRate).toBeCloseTo(2 / 3);
    });

    it('computes a running average response time', () => {
      const svc = CdnConfigService.getInstance();
      svc.recordDeliveryEvent(true, 100);
      svc.recordDeliveryEvent(false, 200);
      const metrics = svc.getDeliveryMetrics();
      expect(metrics.avgResponseTimeMs).toBeCloseTo(150);
    });
  });

  describe('buildOriginConfig()', () => {
    it('returns an object with required CDN origin fields', () => {
      const svc = CdnConfigService.getInstance();
      const origin = svc.buildOriginConfig();
      expect(origin).toHaveProperty('provider');
      expect(origin).toHaveProperty('originUrl');
      expect(origin).toHaveProperty('caching');
      expect(origin).toHaveProperty('security');
    });
  });
});
