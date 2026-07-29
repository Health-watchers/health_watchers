import { Request, Response, NextFunction } from 'express';
import logger from '../utils/logger';

/**
 * Rate limit monitoring middleware — Issue #1048
 *
 * Wraps response to detect 429 status codes and log structured events
 * for monitoring dashboards and alerting. Captures IP, path, method,
 * and user context when a rate limit is triggered.
 *
 * Mount this BEFORE rate-limit middleware so it can observe the response.
 */
export function rateLimitMonitor(req: Request, res: Response, next: NextFunction): void {
  const originalJson = res.json.bind(res);

  res.json = function monitoredJson(body: unknown) {
    if (res.statusCode === 429) {
      const user = (req as any).user;
      logger.warn(
        {
          event: 'rate_limit_exceeded',
          ip: req.ip,
          path: req.path,
          method: req.method,
          userId: user?.userId ?? null,
          clinicId: user?.clinicId ?? null,
          userAgent: req.headers['user-agent'] ?? null,
          xForwardedFor: req.headers['x-forwarded-for'] ?? null,
          retryAfter: res.getHeader('retry-after') ?? null,
        },
        '[rate-limit-monitor] rate limit exceeded'
      );
    }
    return originalJson(body);
  };

  next();
}
