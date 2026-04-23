import rateLimit, { type Options, type RateLimitRequestHandler } from 'express-rate-limit';
import type { Request, Response } from 'express';

// ── Retry-After handler ───────────────────────────────────────────────────────
const makeHandler =
  (windowMs: number, message: Options['message']) =>
  (_req: Request, res: Response, _next: unknown, _options: Options): void => {
    res.set('Retry-After', String(Math.ceil(windowMs / 1000)));
    res.status(429).json(message);
  };

// ── Optional Redis store ──────────────────────────────────────────────────────
// Falls back to in-memory when REDIS_URL is not set.
async function buildStore() {
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) return undefined; // in-memory fallback

  try {
    // @ts-expect-error -- 'redis' is an optional peer dependency; not installed in all environments
    const { createClient } = await import('redis');
    // @ts-expect-error -- 'rate-limit-redis' is an optional peer dependency; not installed in all environments
    const { RedisStore } = await import('rate-limit-redis');
    const client = createClient({ url: redisUrl });
    client.on('error', (err: Error) =>
      console.error('[rate-limit] Redis error, falling back to in-memory:', err.message),
    );
    await client.connect();
    return new RedisStore({ sendCommand: (...args: string[]) => client.sendCommand(args) });
  } catch {
    console.warn('[rate-limit] rate-limit-redis not installed, using in-memory store');
    return undefined;
  }
}

// Shared store promise — resolved once at startup
const storePromise = buildStore();

function make(windowMs: number, max: number, message: object): RateLimitRequestHandler {
  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    message,
    handler: makeHandler(windowMs, message),
    // store is set lazily; in-memory is used until Redis resolves
    store: undefined,
  });
}

// Attach Redis store once it resolves (no-op if undefined)
storePromise.then((store) => {
  if (store) {
    [authLimiter, forgotPasswordLimiter, aiLimiter, paymentLimiter, generalLimiter].forEach(
      (limiter) => {
        // express-rate-limit exposes the store on the handler object
        (limiter as any).store = store;
      },
    );
  }
});

// ── Auth: 10 req / 15 min per IP ──────────────────────────────────────────────
export const authLimiter: RateLimitRequestHandler = make(
  15 * 60 * 1000,
  10,
  { error: 'TooManyRequests', message: 'Too many login attempts. Try again in 15 minutes.' },
);

// ── Forgot-password: 5 req / 1 hour per IP ───────────────────────────────────
export const forgotPasswordLimiter: RateLimitRequestHandler = make(
  60 * 60 * 1000,
  5,
  { error: 'TooManyRequests', message: 'Too many password reset requests. Try again in 1 hour.' },
);

// ── AI endpoints: 10 req / 1 min per clinic ──────────────────────────────────
export const aiLimiter: RateLimitRequestHandler = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request) => req.user?.clinicId ?? req.ip ?? 'unknown',
  message: { error: 'TooManyRequests', message: 'AI rate limit exceeded. Try again in 1 minute.' },
  handler: makeHandler(60 * 1000, {
    error: 'TooManyRequests',
    message: 'AI rate limit exceeded. Try again in 1 minute.',
  }),
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
});

// ── General: 300 req / 15 min per IP ─────────────────────────────────────────
export const generalLimiter: RateLimitRequestHandler = make(
  15 * 60 * 1000,
  300,
  { error: 'TooManyRequests', message: 'Too many requests. Try again in 15 minutes.' },
);
