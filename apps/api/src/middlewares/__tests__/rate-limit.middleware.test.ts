import request from 'supertest';
import express, { Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { authLimiter } from '../rate-limit.middleware';

describe('Rate Limit Middleware', () => {
  let app: express.Application;

  beforeEach(() => {
    app = express();
    app.post('/login', authLimiter, (_req: Request, res: Response) => {
      res.json({ success: true });
    });
  });

  it('should allow requests within the limit', async () => {
    const response = await request(app).post('/login');
    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
  });

  it('should return 429 after exceeding the limit', async () => {
    // Make 5 requests (the limit)
    for (let i = 0; i < 5; i++) {
      const response = await request(app).post('/login');
      expect(response.status).toBe(200);
    }

    // 6th request should be rate limited
    const response = await request(app).post('/login');
    expect(response.status).toBe(429);
    expect(response.body.error).toBe('TooManyRequests');
  });

  it('should include Retry-After header on rate limit', async () => {
    // Exceed the limit
    for (let i = 0; i < 5; i++) {
      await request(app).post('/login');
    }

    const response = await request(app).post('/login');
    expect(response.status).toBe(429);
    expect(response.headers['retry-after']).toBeDefined();
    expect(parseInt(response.headers['retry-after'])).toBeGreaterThan(0);
  });
});

// ── Bypass Prevention Tests ────────────────────────────────────────────────────
describe('Rate Limit Bypass Prevention', () => {
  function makeTestApp(max = 3) {
    const limiter = rateLimit({
      windowMs: 15 * 60 * 1000,
      max,
      standardHeaders: true,
      legacyHeaders: false,
      message: { error: 'TooManyRequests', message: 'Too many requests.' },
    });
    const testApp = express();
    testApp.post('/auth', limiter, (_req: Request, res: Response) =>
      res.json({ ok: true })
    );
    return testApp;
  }

  it('X-Forwarded-For header cannot bypass IP-based rate limit', async () => {
    const testApp = makeTestApp(3);

    for (let i = 0; i < 3; i++) {
      await request(testApp).post('/auth');
    }

    // Attempt bypass by spoofing a different IP via X-Forwarded-For
    const res = await request(testApp)
      .post('/auth')
      .set('X-Forwarded-For', '203.0.113.1');

    // Without trust proxy, XFF is ignored — rate limit key stays as the real socket IP
    expect(res.status).toBe(429);
  });

  it('multiple chained X-Forwarded-For values cannot bypass rate limit', async () => {
    const testApp = makeTestApp(3);

    for (let i = 0; i < 3; i++) {
      await request(testApp).post('/auth');
    }

    const res = await request(testApp)
      .post('/auth')
      .set('X-Forwarded-For', '1.2.3.4, 5.6.7.8, 9.10.11.12');

    expect(res.status).toBe(429);
  });

  it('X-Real-IP header cannot bypass rate limit', async () => {
    const testApp = makeTestApp(3);

    for (let i = 0; i < 3; i++) {
      await request(testApp).post('/auth');
    }

    const res = await request(testApp)
      .post('/auth')
      .set('X-Real-IP', '203.0.113.1');

    expect(res.status).toBe(429);
  });

  it('rate limit response body has the expected error structure', async () => {
    const testApp = makeTestApp(1);

    await request(testApp).post('/auth'); // consume the 1 allowed request

    const res = await request(testApp).post('/auth');

    expect(res.status).toBe(429);
    expect(res.body).toHaveProperty('error', 'TooManyRequests');
    expect(res.body).toHaveProperty('message');
    expect(res.body).not.toHaveProperty('stack');
  });

  it('RateLimit-Limit and RateLimit-Remaining standard headers are present', async () => {
    const testApp = makeTestApp(5);

    const res = await request(testApp).post('/auth');

    expect(res.status).toBe(200);
    expect(res.headers['ratelimit-limit']).toBeDefined();
    expect(res.headers['ratelimit-remaining']).toBeDefined();
  });

  it('Retry-After header value is a positive integer (seconds)', async () => {
    const testApp = makeTestApp(1);

    await request(testApp).post('/auth');
    const res = await request(testApp).post('/auth');

    expect(res.status).toBe(429);
    const retryAfter = parseInt(res.headers['retry-after'], 10);
    expect(Number.isInteger(retryAfter)).toBe(true);
    expect(retryAfter).toBeGreaterThan(0);
  });
});

// ── User-keyed Limiter Bypass Prevention ──────────────────────────────────────
describe('User-keyed rate limiter bypass prevention', () => {
  const USER_A = 'user-aaa-111';
  const USER_B = 'user-bbb-222';

  function makeUserKeyedApp(max = 2) {
    const limiter = rateLimit({
      windowMs: 60 * 1000,
      max,
      standardHeaders: true,
      legacyHeaders: false,
      keyGenerator: (req: any) => req.user?.userId ?? req.ip ?? 'unknown',
      message: { error: 'TooManyRequests', message: 'Too many requests.' },
    });
    const testApp = express();
    testApp.use((req: any, _res: Response, next) => {
      const uid = req.headers['x-test-user-id'] as string | undefined;
      if (uid) req.user = { userId: uid, clinicId: 'clinic-1', role: 'DOCTOR' };
      next();
    });
    testApp.get('/data', limiter, (_req: Request, res: Response) =>
      res.json({ ok: true })
    );
    return testApp;
  }

  it('different users have independent rate limit counters', async () => {
    const testApp = makeUserKeyedApp(2);

    // Exhaust User A's limit
    for (let i = 0; i < 2; i++) {
      await request(testApp).get('/data').set('x-test-user-id', USER_A);
    }
    const blockedA = await request(testApp).get('/data').set('x-test-user-id', USER_A);
    expect(blockedA.status).toBe(429);

    // User B is a separate bucket and should not be affected
    const okB = await request(testApp).get('/data').set('x-test-user-id', USER_B);
    expect(okB.status).toBe(200);
  });

  it('changing X-Forwarded-For does not bypass a user-keyed rate limit', async () => {
    const testApp = makeUserKeyedApp(2);

    for (let i = 0; i < 2; i++) {
      await request(testApp).get('/data').set('x-test-user-id', USER_A);
    }

    // Same user ID, different claimed source IP — should still be rate limited
    const res = await request(testApp)
      .get('/data')
      .set('x-test-user-id', USER_A)
      .set('X-Forwarded-For', '1.2.3.4');

    expect(res.status).toBe(429);
  });

  it('unauthenticated requests fall back to IP-based key', async () => {
    const testApp = makeUserKeyedApp(2);

    // Two unauthenticated requests exhaust the IP-keyed limit
    for (let i = 0; i < 2; i++) {
      await request(testApp).get('/data');
    }

    // Third unauthenticated request from same IP should be blocked
    const res = await request(testApp).get('/data');
    expect(res.status).toBe(429);
  });
});
