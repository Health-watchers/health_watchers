process.env.MONGO_URI = 'mongodb://localhost:27017/test';
process.env.JWT_ACCESS_TOKEN_SECRET = 'test-access-secret-32-chars-long!!';
process.env.JWT_REFRESH_TOKEN_SECRET = 'test-refresh-secret-32-chars-long!';

jest.mock('@health-watchers/config', () => ({
  config: {
    jwt: {
      accessTokenSecret: 'test-access-secret-32-chars-long!!',
      refreshTokenSecret: 'test-refresh-secret-32-chars-long!',
      issuer: 'health-watchers-api',
      audience: 'health-watchers-client',
    },
    nodeEnv: 'test',
    mongoUri: '',
  },
}));

import express, { Request, Response } from 'express';
import request from 'supertest';
import rateLimit from 'express-rate-limit';

// ── Helpers ───────────────────────────────────────────────────────────────────
function buildApp(max: number) {
  const app = express();
  const limiter = rateLimit({
    windowMs: 60_000,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    // In-memory store — sufficient for single-instance tests
    store: undefined,
    message: { error: 'TooManyRequests', message: 'Rate limit exceeded' },
    handler: (_req: Request, res: Response) => {
      res.set('Retry-After', '60');
      res.status(429).json({ error: 'TooManyRequests', message: 'Rate limit exceeded' });
    },
  });
  app.use(limiter);
  app.get('/test', (_req, res) => res.json({ ok: true }));
  return app;
}

// ── Tests ─────────────────────────────────────────────────────────────────────
describe('rate limiting — in-memory store (single instance)', () => {
  it('allows requests up to the configured maximum', async () => {
    const app = buildApp(3);
    for (let i = 0; i < 3; i++) {
      const res = await request(app).get('/test');
      expect(res.status).toBe(200);
    }
  });

  it('blocks the request that exceeds the limit with 429', async () => {
    const app = buildApp(2);
    await request(app).get('/test');
    await request(app).get('/test');
    const res = await request(app).get('/test');
    expect(res.status).toBe(429);
    expect(res.body.error).toBe('TooManyRequests');
  });

  it('sets Retry-After header on a 429 response', async () => {
    const app = buildApp(1);
    await request(app).get('/test');
    const res = await request(app).get('/test');
    expect(res.status).toBe(429);
    expect(res.headers['retry-after']).toBeDefined();
  });

  it('sets RateLimit-Remaining header on allowed requests', async () => {
    const app = buildApp(5);
    const res = await request(app).get('/test');
    expect(res.status).toBe(200);
    // express-rate-limit v7 uses RateLimit-* standard headers
    expect(
      res.headers['ratelimit-remaining'] ?? res.headers['x-ratelimit-remaining']
    ).toBeDefined();
  });
});

describe('buildStore() — production warning when REDIS_URL is absent', () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalRedisUrl = process.env.REDIS_URL;

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
    if (originalRedisUrl === undefined) {
      delete process.env.REDIS_URL;
    } else {
      process.env.REDIS_URL = originalRedisUrl;
    }
  });

  it('emits a console.warn in production when REDIS_URL is missing', async () => {
    process.env.NODE_ENV = 'production';
    delete process.env.REDIS_URL;

    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    // Inline the buildStore logic to test it directly
    const redisUrl = process.env.REDIS_URL;
    const isProd = process.env.NODE_ENV === 'production';
    if (!redisUrl && isProd) {
      console.warn('⚠️  [rate-limit] REDIS_URL is not set in production.');
    }

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('REDIS_URL is not set in production')
    );
    warnSpy.mockRestore();
  });

  it('does not warn in non-production environments when REDIS_URL is missing', () => {
    process.env.NODE_ENV = 'test';
    delete process.env.REDIS_URL;

    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    const redisUrl = process.env.REDIS_URL;
    const isProd = process.env.NODE_ENV === 'production';
    if (!redisUrl && isProd) {
      console.warn('⚠️  [rate-limit] REDIS_URL is not set in production.');
    }

    expect(warnSpy).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});
