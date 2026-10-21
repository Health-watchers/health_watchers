import { Request, Response, NextFunction } from 'express';
import {
  checkRateLimit,
  setRateLimitHeaders,
  sendRateLimitExceeded,
} from './rate-limit.middleware';

/**
 * Export rate limiter: max 5 export requests per clinic per hour.
 * Backed by the shared Redis sliding-window limiter.
 */
const WINDOW_MS = 60 * 60 * 1000; // 1 hour
const MAX_REQUESTS = 5;

export async function exportRateLimit(req: Request, res: Response, next: NextFunction) {
  const clinicId = req.user?.clinicId;
  if (!clinicId)
    return res.status(401).json({ error: 'Unauthorized', message: 'No clinic context' });

  try {
    const result = await checkRateLimit({
      key: `export:clinic:${clinicId}`,
      limit: MAX_REQUESTS,
      windowMs: WINDOW_MS,
    });

    setRateLimitHeaders(res, result);

    if (!result.allowed) {
      return sendRateLimitExceeded(
        res,
        result,
        `Export limit of ${MAX_REQUESTS} requests per hour exceeded.`,
      );
    }

    return next();
  } catch (err) {
    return next(err);
  }
}