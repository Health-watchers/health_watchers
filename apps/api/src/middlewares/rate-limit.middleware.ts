import rateLimit, { type Options, type RateLimitRequestHandler } from 'express-rate-limit';
import type { Request, Response, NextFunction } from 'express';

const makeHandler = (windowMs: number, message: Options['message']) =>
  (req: Request, res: Response, _next: NextFunction, options: Options): void => {
    const retryAfter = Math.ceil(windowMs / 1000);
    res.set('Retry-After', String(retryAfter));
    res.status(429).json(message);
  };

/**
 * Strict limiter for auth endpoints (login, refresh).
 * 10 requests per 15 minutes per IP.
 * Returns 429 with Retry-After and X-RateLimit-* headers.
 */
export const authLimiter: RateLimitRequestHandler = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  standardHeaders: true,  // sets X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset
  legacyHeaders: false,
  message: {
    error: 'TooManyRequests',
    message: 'Too many requests from this IP, please try again after 15 minutes.',
  },
  handler: makeHandler(15 * 60 * 1000, {
    error: 'TooManyRequests',
    message: 'Too many requests from this IP, please try again after 15 minutes.',
  }),
});

/**
 * General limiter for all API routes.
 * 100 requests per minute per IP.
 */
export const generalLimiter: RateLimitRequestHandler = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'TooManyRequests',
    message: 'Too many requests from this IP, please try again after 1 minute.',
  },
  handler: makeHandler(60 * 1000, {
    error: 'TooManyRequests',
    message: 'Too many requests from this IP, please try again after 1 minute.',
  }),
});
