/**
 * CDN Health & Monitoring Routes — Issue #1078
 *
 * GET  /api/v1/cdn/health        — CDN configuration & health status
 * GET  /api/v1/cdn/config        — Active CDN provider configuration
 * POST /api/v1/cdn/test-delivery — Test asset delivery from CDN origin
 */

import { Router, Request, Response } from 'express';
import { authenticate } from '@api/middlewares/auth.middleware';
import { authorize } from '@api/middlewares/rbac.middleware';

const router = Router();

/**
 * Known CDN providers that can be configured via environment variables.
 */
const CDN_PROVIDERS = ['cloudflare', 'cloudfront', 'fastly', 'custom'] as const;
type CdnProvider = (typeof CDN_PROVIDERS)[number];

interface CdnProviderStatus {
  provider: CdnProvider;
  configured: boolean;
  url: string | null;
  region: string | null;
}

/**
 * Inspect environment variables and return the status of each supported CDN
 * provider.  No credentials are exposed — only whether they are set.
 */
function getCdnProviderStatuses(): CdnProviderStatus[] {
  const cdnUrl = process.env.NEXT_PUBLIC_CDN_URL || null;
  const activeProvider = (process.env.NEXT_PUBLIC_CDN_PROVIDER as CdnProvider) || 'custom';

  return CDN_PROVIDERS.map((provider) => {
    switch (provider) {
      case 'cloudflare':
        return {
          provider,
          configured: !!(process.env.CLOUDFLARE_ZONE_ID && process.env.CLOUDFLARE_API_KEY),
          url: activeProvider === 'cloudflare' ? cdnUrl : null,
          region: null,
        };
      case 'cloudfront':
        return {
          provider,
          configured: !!(
            process.env.CLOUDFRONT_DISTRIBUTION_ID && process.env.AWS_ACCESS_KEY_ID
          ),
          url: activeProvider === 'cloudfront' ? cdnUrl : null,
          region: process.env.AWS_REGION || null,
        };
      case 'fastly':
        return {
          provider,
          configured: !!(process.env.FASTLY_SERVICE_ID && process.env.FASTLY_API_KEY),
          url: activeProvider === 'fastly' ? cdnUrl : null,
          region: null,
        };
      default:
        return {
          provider: 'custom' as CdnProvider,
          configured: !!cdnUrl,
          url: cdnUrl,
          region: null,
        };
    }
  });
}

/**
 * GET /api/v1/cdn/health
 * Returns CDN configuration health — which providers are configured, which is active.
 */
router.get('/health', authenticate, authorize(['admin']), (_req: Request, res: Response) => {
  try {
    const statuses = getCdnProviderStatuses();
    const activeProvider = (process.env.NEXT_PUBLIC_CDN_PROVIDER as CdnProvider) || 'custom';
    const cdnUrl = process.env.NEXT_PUBLIC_CDN_URL || null;
    const monitoringEnabled = process.env.ENABLE_CDN_MONITORING === 'true';

    const configured = statuses.some((s) => s.configured);

    res.json({
      success: true,
      data: {
        active: activeProvider,
        cdnUrl,
        monitoringEnabled,
        configured,
        providers: statuses,
        cacheConfig: {
          maxAge: parseInt(process.env.CDN_CACHE_MAX_AGE || '31536000', 10),
          staleWhileRevalidate: parseInt(
            process.env.CDN_STALE_WHILE_REVALIDATE || '86400',
            10,
          ),
        },
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ error: 'Failed to retrieve CDN health', message });
  }
});

/**
 * GET /api/v1/cdn/config
 * Returns the active CDN provider configuration (non-sensitive fields only).
 */
router.get('/config', authenticate, authorize(['admin']), (_req: Request, res: Response) => {
  const activeProvider = (process.env.NEXT_PUBLIC_CDN_PROVIDER as CdnProvider) || 'custom';
  const cdnUrl = process.env.NEXT_PUBLIC_CDN_URL || null;

  const config: Record<string, unknown> = {
    provider: activeProvider,
    cdnUrl,
    appVersion: process.env.NEXT_PUBLIC_APP_VERSION || '1.0.0',
    cacheMaxAge: parseInt(process.env.CDN_CACHE_MAX_AGE || '31536000', 10),
    staleWhileRevalidate: parseInt(process.env.CDN_STALE_WHILE_REVALIDATE || '86400', 10),
    monitoringEnabled: process.env.ENABLE_CDN_MONITORING === 'true',
    monitoringIntervalSeconds: parseInt(process.env.CDN_MONITORING_INTERVAL || '3600', 10),
  };

  // Provider-specific (non-sensitive) fields
  if (activeProvider === 'cloudfront') {
    config.distributionId = process.env.CLOUDFRONT_DISTRIBUTION_ID
      ? '***configured***'
      : 'not-configured';
    config.awsRegion = process.env.AWS_REGION || 'us-east-1';
  }

  if (activeProvider === 'cloudflare') {
    config.zoneId = process.env.CLOUDFLARE_ZONE_ID ? '***configured***' : 'not-configured';
    config.accountId = process.env.CLOUDFLARE_ACCOUNT_ID
      ? '***configured***'
      : 'not-configured';
  }

  if (activeProvider === 'fastly') {
    config.serviceId = process.env.FASTLY_SERVICE_ID ? '***configured***' : 'not-configured';
  }

  res.json({
    success: true,
    data: config,
    timestamp: new Date().toISOString(),
  });
});

/**
 * POST /api/v1/cdn/test-delivery
 * Perform a HEAD request to the CDN URL to verify asset delivery is working.
 */
router.post(
  '/test-delivery',
  authenticate,
  authorize(['admin']),
  async (req: Request, res: Response) => {
    const cdnUrl = process.env.NEXT_PUBLIC_CDN_URL;
    if (!cdnUrl) {
      return res.status(503).json({
        success: false,
        error: 'CDN_NOT_CONFIGURED',
        message: 'NEXT_PUBLIC_CDN_URL is not set',
      });
    }

    const testPath = (req.body?.path as string) || '/';
    const targetUrl = `${cdnUrl.replace(/\/$/, '')}${testPath}`;

    const start = Date.now();
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const response = await fetch(targetUrl, {
        method: 'HEAD',
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      const latencyMs = Date.now() - start;

      res.json({
        success: true,
        data: {
          url: targetUrl,
          statusCode: response.status,
          latencyMs,
          cacheControl: response.headers.get('cache-control') || null,
          cdnProvider: response.headers.get('server') || null,
          cfRay: response.headers.get('cf-ray') || null,
          xCache: response.headers.get('x-cache') || null,
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(502).json({
        success: false,
        error: 'CDN_DELIVERY_TEST_FAILED',
        message,
        latencyMs: Date.now() - start,
      });
    }
  },
);

export default router;
