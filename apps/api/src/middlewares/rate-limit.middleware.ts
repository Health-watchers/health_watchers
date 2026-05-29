import rateLimit, { type Options, type RateLimitRequestHandler } from 'express-rate-limit';
import type { Request, Response } from 'express';
import logger from '../utils/logger';

// ── Retry-After handler ───────────────────────────────────────────────────────
const makeHandler =
  (windowMs: number, message: Options['message']) =>
  (_req: Request, res: Response, _next: unknown, _options: Options): void => {
    res.set('Retry-After', String(Math.ceil(windowMs / 1000)));
    res.status(429).json(message);
  };

// ── Redis store initialization ────────────────────────────────────────────────
let redisStore: any = undefined;
let redisInitialized = false;

async function initializeRedisStore(): Promise<void> {
  if (redisInitialized) return;
  redisInitialized = true;

  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
    logger.warn(
      '[rate-limit] REDIS_URL not configured. Using in-memory store. ' +
        'Multi-instance deployments are NOT protected against distributed brute-force attacks. ' +
        'Set REDIS_URL for production deployments.'
    );
    return;
  }

  try {
    const { createClient } = await import('redis');
    const { RedisStore } = await import('rate-limit-redis');

    const client = createClient({ url: redisUrl });
    client.on('error', (err: Error) => {
      logger.error('[rate-limit] Redis connection error:', err.message);
      logger.warn('[rate-limit] Falling back to in-memory store for rate limiting');
    });

    await client.connect();
    redisStore = new RedisStore({
      sendCommand: (...args: string[]) => client.sendCommand(args),
    });
    logger.info('[rate-limit] Redis store initialized successfully');
  } catch (err) {
    logger.error('[rate-limit] Failed to initialize Redis store:', err instanceof Error ? err.message : String(err));
    logger.warn('[rate-limit] Falling back to in-memory store. Multi-instance deployments are NOT protected.');
  }
}

// Initialize Redis on module load
initializeRedisStore().catch((err) => {
  logger.error('[rate-limit] Unexpected error during Redis initialization:', err);
});

function make(windowMs: number, max: number, message: object): RateLimitRequestHandler {
  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    message,
    handler: makeHandler(windowMs, message),
    store: redisStore,
  });
}

// ── Auth: 5 req / 15 min per IP ───────────────────────────────────────────────
export const authLimiter: RateLimitRequestHandler = make(15 * 60 * 1000, 5, {
  error: 'TooManyRequests',
  message: 'Too many login attempts. Try again in 15 minutes.',
});

// ── Forgot-password: 3 req / 1 hour per IP ───────────────────────────────────
export const forgotPasswordLimiter: RateLimitRequestHandler = make(60 * 60 * 1000, 3, {
  error: 'TooManyRequests',
  message: 'Too many password reset requests. Try again in 1 hour.',
});

// ── AI endpoints: 20 req / 1 min per clinic ──────────────────────────────────
export const aiLimiter: RateLimitRequestHandler = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request) => req.user?.clinicId ?? req.ip ?? 'unknown',
  message: { error: 'TooManyRequests', message: 'AI rate limit exceeded. Try again in 1 minute.' },
  handler: makeHandler(60 * 1000, {
    error: 'TooManyRequests',
    message: 'AI rate limit exceeded. Try again in 1 minute.',
  }),
  store: redisStore,
});

// ── Payment intent: 20 req / 1 min per clinic ────────────────────────────────
export const paymentLimiter: RateLimitRequestHandler = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request) => req.user?.clinicId ?? req.ip ?? 'unknown',
  message: {
    error: 'TooManyRequests',
    message: 'Payment rate limit exceeded. Try again in 1 minute.',
  },
  handler: makeHandler(60 * 1000, {
    error: 'TooManyRequests',
    message: 'Payment rate limit exceeded. Try again in 1 minute.',
  }),
  store: redisStore,
});

// ── General: 300 req / 15 min per IP ──────────────────────────────────────────
export const generalLimiter: RateLimitRequestHandler = make(15 * 60 * 1000, 300, {
  error: 'TooManyRequests',
  message: 'Too many requests. Try again in 15 minutes.',
});

// ── Per-user limiters (keyed by userId from JWT) ──────────────────────────────
function makeUserLimiter(
  windowMs: number,
  max: number,
  message: object
): RateLimitRequestHandler {
  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req: Request) => req.user?.userId ?? req.ip ?? 'unknown',
    message,
    handler: makeHandler(windowMs, message),
    store: redisStore,
  });
}

// Bulk export: 5 req / 1 hour per user
export const bulkExportLimiter: RateLimitRequestHandler = makeUserLimiter(
  60 * 60 * 1000,
  5,
  { error: 'TooManyRequests', message: 'Bulk export limit: 5 per hour. Try again later.' }
);

// Patient search: 100 req / 1 min per user
export const patientSearchLimiter: RateLimitRequestHandler = makeUserLimiter(
  60 * 1000,
  100,
  { error: 'TooManyRequests', message: 'Search rate limit exceeded. Try again in 1 minute.' }
);

// Report generation: 10 req / 1 hour per user
export const reportGenerationLimiter: RateLimitRequestHandler = makeUserLimiter(
  60 * 60 * 1000,
  10,
  { error: 'TooManyRequests', message: 'Report generation limit: 10 per hour. Try again later.' }
);
