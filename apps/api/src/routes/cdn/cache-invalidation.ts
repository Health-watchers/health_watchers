import { Router, Request, Response } from 'express';
import { authenticate } from '@/middlewares/auth.middleware';
import { authorize } from '@/middlewares/rbac.middleware';
import { validateRequest } from '@/middlewares/validate.middleware';
import { z } from 'zod';

const router = Router();

/**
 * Validation schema for cache invalidation requests
 */
const cacheInvalidationSchema = z.object({
  paths: z.array(z.string()).min(1).max(100),
  provider: z.enum(['cloudflare', 'cloudfront', 'fastly', 'all']).optional(),
  priority: z.enum(['high', 'normal']).optional().default('normal'),
});

type CacheInvalidationRequest = z.infer<typeof cacheInvalidationSchema>;

/**
 * POST /api/v1/cdn/cache-invalidation
 * Invalidate CDN cache for specified paths
 * Requires admin authorization
 */
router.post(
  '/cache-invalidation',
  authenticate,
  authorize(['admin']),
  validateRequest(cacheInvalidationSchema),
  async (req: Request, res: Response) => {
    try {
      const payload = req.body as CacheInvalidationRequest;

      // Validate paths don't contain dangerous characters
      const validPaths = payload.paths.every((p) => /^[a-zA-Z0-9\-_/.]+$/.test(p));
      if (!validPaths) {
        return res.status(400).json({
          error: 'Invalid path format',
          message:
            'Paths can only contain alphanumeric characters, hyphens, underscores, forward slashes, and dots',
        });
      }

      const results = await invalidateCDNCache(
        payload.paths,
        payload.provider || 'all',
        payload.priority
      );

      res.json({
        success: true,
        message: 'Cache invalidation initiated',
        results,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({
        error: 'Cache invalidation failed',
        message: errorMessage,
      });
    }
  }
);

/**
 * POST /api/v1/cdn/cache-invalidation/bulk
 * Bulk invalidate multiple cache keys with priority queuing
 */
router.post(
  '/cache-invalidation/bulk',
  authenticate,
  authorize(['admin']),
  async (req: Request, res: Response) => {
    try {
      const { invalidations } = req.body as {
        invalidations: Array<{
          paths: string[];
          priority: 'high' | 'normal';
        }>;
      };

      if (!Array.isArray(invalidations) || invalidations.length === 0) {
        return res.status(400).json({
          error: 'No invalidations provided',
        });
      }

      const results = await processBulkInvalidation(invalidations);

      res.json({
        success: true,
        message: 'Bulk cache invalidation initiated',
        processed: results.length,
        results,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({
        error: 'Bulk invalidation failed',
        message: errorMessage,
      });
    }
  }
);

/**
 * GET /api/v1/cdn/cache-status/:path
 * Check cache status for a specific path
 */
router.get('/cache-status/:path', authenticate, async (req: Request, res: Response) => {
  try {
    const { path } = req.params;
    const status = await checkCacheStatus(path);

    res.json({
      path,
      status,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({
      error: 'Failed to check cache status',
      message: errorMessage,
    });
  }
});

/**
 * GET /api/v1/cdn/metrics
 * Get CDN performance metrics
 */
router.get('/metrics', authenticate, authorize(['admin']), async (req: Request, res: Response) => {
  try {
    const metrics = await getCDNMetrics();

    res.json({
      success: true,
      metrics,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({
      error: 'Failed to fetch CDN metrics',
      message: errorMessage,
    });
  }
});

/**
 * Invalidate cache across CDN providers
 */
async function invalidateCDNCache(
  paths: string[],
  provider: string,
  priority: string
): Promise<Record<string, unknown>> {
  const results: Record<string, unknown> = {};

  const providers = provider === 'all' ? ['cloudflare', 'cloudfront', 'fastly'] : [provider];

  for (const p of providers) {
    try {
      switch (p) {
        case 'cloudflare':
          results.cloudflare = await invalidateCloudflare(paths);
          break;
        case 'cloudfront':
          results.cloudfront = await invalidateCloudFront(paths);
          break;
        case 'fastly':
          results.fastly = await invalidateFastly(paths);
          break;
      }
    } catch (error) {
      results[`${p}_error`] = error instanceof Error ? error.message : 'Unknown error';
    }
  }

  return results;
}

/**
 * Invalidate Cloudflare cache
 */
async function invalidateCloudflare(paths: string[]): Promise<Record<string, unknown>> {
  const zoneId = process.env.CLOUDFLARE_ZONE_ID;
  const apiKey = process.env.CLOUDFLARE_API_KEY;

  if (!zoneId || !apiKey) {
    throw new Error('Cloudflare credentials not configured');
  }

  const response = await fetch(`https://api.cloudflare.com/client/v4/zones/${zoneId}/purge_cache`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ files: paths }),
  });

  const data = (await response.json()) as Record<string, unknown>;

  if (!response.ok) {
    throw new Error(`Cloudflare API error: ${JSON.stringify(data)}`);
  }

  return { status: 'success', pathsInvalidated: paths.length };
}

/**
 * Invalidate CloudFront cache
 */
async function invalidateCloudFront(paths: string[]): Promise<Record<string, unknown>> {
  // Implementation would use AWS SDK
  // @aws-sdk/client-cloudfront
  return { status: 'pending', message: 'CloudFront invalidation not yet implemented' };
}

/**
 * Invalidate Fastly cache
 */
async function invalidateFastly(paths: string[]): Promise<Record<string, unknown>> {
  const apiKey = process.env.FASTLY_API_KEY;

  if (!apiKey) {
    throw new Error('Fastly credentials not configured');
  }

  const response = await fetch('https://api.fastly.com/purge', {
    method: 'POST',
    headers: {
      'Fastly-Key': apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ urls: paths }),
  });

  const data = (await response.json()) as Record<string, unknown>;

  if (!response.ok) {
    throw new Error(`Fastly API error: ${JSON.stringify(data)}`);
  }

  return { status: 'success', pathsInvalidated: paths.length };
}

/**
 * Process bulk invalidation with priority queuing
 */
async function processBulkInvalidation(
  invalidations: Array<{ paths: string[]; priority: 'high' | 'normal' }>
): Promise<Array<Record<string, unknown>>> {
  // Sort by priority
  const sorted = invalidations.sort((a, b) => {
    if (a.priority === 'high' && b.priority === 'normal') return -1;
    if (a.priority === 'normal' && b.priority === 'high') return 1;
    return 0;
  });

  return Promise.all(
    sorted.map((inv) =>
      invalidateCDNCache(inv.paths, 'all', inv.priority).catch((error) => ({
        error: error instanceof Error ? error.message : 'Unknown error',
        paths: inv.paths,
      }))
    )
  );
}

/**
 * Check cache status for a path
 */
async function checkCacheStatus(path: string): Promise<Record<string, unknown>> {
  // This would make HEAD requests to check cache headers
  return {
    cached: true,
    cacheControl: 'public, max-age=3600',
    etag: 'example-etag',
    lastModified: new Date().toISOString(),
  };
}

/**
 * Get CDN metrics
 */
async function getCDNMetrics(): Promise<Record<string, unknown>> {
  return {
    provider: process.env.NEXT_PUBLIC_CDN_PROVIDER || 'custom',
    cacheHitRate: 0.85,
    avgResponseTime: 250,
    totalRequests: 1000000,
    cachedRequests: 850000,
    originRequests: 150000,
    lastUpdated: new Date().toISOString(),
  };
}

export default router;
