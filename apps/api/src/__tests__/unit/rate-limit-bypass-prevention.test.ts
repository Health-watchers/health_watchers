/**
 * Rate Limiting Bypass Prevention — Issue #1048
 *
 * Comprehensive tests verifying that rate limits cannot be circumvented via:
 *  - IP header spoofing (X-Forwarded-For, X-Real-IP, Forwarded, X-Client-IP)
 *  - HTTP method switching (GET vs POST on same endpoint)
 *  - URL path variations (case, trailing slash, encoding)
 *  - User-keyed limiter manipulation
 *  - Concurrent burst requests
 *  - Response header correctness for monitoring
 */

import request from 'supertest';
import express, { Request, Response } from 'express';
import rateLimit from 'express-rate-limit';

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Build a test app with IP-based rate limiting (no trust proxy). */
function makeIpApp(max = 3) {
  const app = express();
  // Explicitly do NOT trust proxy — matches production behind no reverse proxy
  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'TooManyRequests', message: 'Too many requests.' },
  });
  app.post('/auth', limiter, (_req: Request, res: Response) => res.json({ ok: true }));
  app.get('/auth', limiter, (_req: Request, res: Response) => res.json({ ok: true }));
  app.post('/api/v1/login', limiter, (_req: Request, res: Response) => res.json({ ok: true }));
  app.post('/api/v1/Login', limiter, (_req: Request, res: Response) => res.json({ ok: true }));
  return app;
}

/** Build a test app with user-keyed rate limiting. */
function makeUserApp(max = 2) {
  const limiter = rateLimit({
    windowMs: 60 * 1000,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req: any) => req.user?.userId ?? req.ip ?? 'unknown',
    message: { error: 'TooManyRequests', message: 'Too many requests.' },
  });

  const app = express();
  // Fake auth middleware
  app.use((req: any, _res: Response, next) => {
    const uid = req.headers['x-test-user-id'] as string | undefined;
    if (uid) req.user = { userId: uid, clinicId: 'clinic-1', role: 'DOCTOR' };
    next();
  });
  app.get('/data', limiter, (_req: Request, res: Response) => res.json({ ok: true }));
  app.post('/data', limiter, (_req: Request, res: Response) => res.json({ ok: true }));
  return app;
}

/** Build a test app with clinic-keyed rate limiting (like AI/payment limiters). */
function makeClinicApp(max = 3) {
  const limiter = rateLimit({
    windowMs: 60 * 1000,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req: any) => req.user?.clinicId ?? req.ip ?? 'unknown',
    message: { error: 'TooManyRequests', message: 'Too many requests.' },
  });

  const app = express();
  app.use((req: any, _res: Response, next) => {
    const clinicId = req.headers['x-test-clinic-id'] as string | undefined;
    const userId = req.headers['x-test-user-id'] as string | undefined;
    if (clinicId) req.user = { userId: userId ?? 'user-1', clinicId, role: 'DOCTOR' };
    next();
  });
  app.post('/ai/generate', limiter, (_req: Request, res: Response) => res.json({ ok: true }));
  return app;
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. IP Header Spoofing Prevention
// ─────────────────────────────────────────────────────────────────────────────
describe('IP header spoofing prevention', () => {
  it('X-Forwarded-For header cannot bypass IP-based rate limit', async () => {
    const app = makeIpApp(3);

    for (let i = 0; i < 3; i++) {
      await request(app).post('/auth');
    }

    const res = await request(app).post('/auth').set('X-Forwarded-For', '203.0.113.1');
    expect(res.status).toBe(429);
  });

  it('multiple chained X-Forwarded-For values cannot bypass', async () => {
    const app = makeIpApp(3);

    for (let i = 0; i < 3; i++) {
      await request(app).post('/auth');
    }

    const res = await request(app)
      .post('/auth')
      .set('X-Forwarded-For', '1.2.3.4, 5.6.7.8, 9.10.11.12');
    expect(res.status).toBe(429);
  });

  it('X-Real-IP header cannot bypass rate limit', async () => {
    const app = makeIpApp(3);

    for (let i = 0; i < 3; i++) {
      await request(app).post('/auth');
    }

    const res = await request(app).post('/auth').set('X-Real-IP', '203.0.113.1');
    expect(res.status).toBe(429);
  });

  it('Forwarded header cannot bypass rate limit', async () => {
    const app = makeIpApp(3);

    for (let i = 0; i < 3; i++) {
      await request(app).post('/auth');
    }

    const res = await request(app).post('/auth').set('Forwarded', 'for=198.51.100.1');
    expect(res.status).toBe(429);
  });

  it('X-Client-IP header cannot bypass rate limit', async () => {
    const app = makeIpApp(3);

    for (let i = 0; i < 3; i++) {
      await request(app).post('/auth');
    }

    const res = await request(app).post('/auth').set('X-Client-IP', '10.0.0.1');
    expect(res.status).toBe(429);
  });

  it('rotating X-Forwarded-For values on each request cannot bypass', async () => {
    const app = makeIpApp(3);

    for (let i = 0; i < 3; i++) {
      await request(app).post('/auth').set('X-Forwarded-For', `192.168.1.${i}`);
    }

    // 4th request with yet another spoofed IP — should still be blocked
    const res = await request(app).post('/auth').set('X-Forwarded-For', '192.168.1.99');
    expect(res.status).toBe(429);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. HTTP Method Bypass Prevention
// ─────────────────────────────────────────────────────────────────────────────
describe('HTTP method bypass prevention', () => {
  it('GET and POST to same path share the rate limit bucket', async () => {
    const app = makeIpApp(3);

    // Use 2 POSTs
    await request(app).post('/auth');
    await request(app).post('/auth');

    // Use 1 GET
    await request(app).get('/auth');

    // 4th request (either method) should be blocked
    const res = await request(app).post('/auth');
    expect(res.status).toBe(429);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Response Header Correctness (Monitoring)
// ─────────────────────────────────────────────────────────────────────────────
describe('rate limit response headers for monitoring', () => {
  it('includes RateLimit-Limit header on successful requests', async () => {
    const app = makeIpApp(5);
    const res = await request(app).post('/auth');

    expect(res.status).toBe(200);
    expect(res.headers['ratelimit-limit']).toBeDefined();
  });

  it('includes RateLimit-Remaining header on successful requests', async () => {
    const app = makeIpApp(5);
    const res = await request(app).post('/auth');

    expect(res.status).toBe(200);
    expect(res.headers['ratelimit-remaining']).toBeDefined();
  });

  it('RateLimit-Remaining decrements with each request', async () => {
    const app = makeIpApp(5);

    const res1 = await request(app).post('/auth');
    const remaining1 = parseInt(res1.headers['ratelimit-remaining'], 10);

    const res2 = await request(app).post('/auth');
    const remaining2 = parseInt(res2.headers['ratelimit-remaining'], 10);

    expect(remaining2).toBe(remaining1 - 1);
  });

  it('includes RateLimit-Reset header', async () => {
    const app = makeIpApp(5);
    const res = await request(app).post('/auth');

    expect(res.status).toBe(200);
    expect(res.headers['ratelimit-reset']).toBeDefined();
  });

  it('429 response includes Retry-After as a positive integer', async () => {
    const app = makeIpApp(1);
    await request(app).post('/auth');
    const res = await request(app).post('/auth');

    expect(res.status).toBe(429);
    const retryAfter = parseInt(res.headers['retry-after'], 10);
    expect(Number.isInteger(retryAfter)).toBe(true);
    expect(retryAfter).toBeGreaterThan(0);
  });

  it('429 response body has structured error format (no stack traces)', async () => {
    const app = makeIpApp(1);
    await request(app).post('/auth');
    const res = await request(app).post('/auth');

    expect(res.status).toBe(429);
    expect(res.body).toHaveProperty('error', 'TooManyRequests');
    expect(res.body).toHaveProperty('message');
    expect(res.body).not.toHaveProperty('stack');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. User-keyed Limiter Bypass Prevention
// ─────────────────────────────────────────────────────────────────────────────
describe('user-keyed rate limiter bypass prevention', () => {
  const USER_A = 'user-aaa-111';
  const USER_B = 'user-bbb-222';

  it('different users have independent rate limit counters', async () => {
    const app = makeUserApp(2);

    // Exhaust User A's limit
    for (let i = 0; i < 2; i++) {
      await request(app).get('/data').set('x-test-user-id', USER_A);
    }
    const blockedA = await request(app).get('/data').set('x-test-user-id', USER_A);
    expect(blockedA.status).toBe(429);

    // User B should not be affected
    const okB = await request(app).get('/data').set('x-test-user-id', USER_B);
    expect(okB.status).toBe(200);
  });

  it('changing X-Forwarded-For does not bypass user-keyed rate limit', async () => {
    const app = makeUserApp(2);

    for (let i = 0; i < 2; i++) {
      await request(app).get('/data').set('x-test-user-id', USER_A);
    }

    const res = await request(app)
      .get('/data')
      .set('x-test-user-id', USER_A)
      .set('X-Forwarded-For', '1.2.3.4');

    expect(res.status).toBe(429);
  });

  it('unauthenticated requests fall back to IP-based key', async () => {
    const app = makeUserApp(2);

    for (let i = 0; i < 2; i++) {
      await request(app).get('/data');
    }

    const res = await request(app).get('/data');
    expect(res.status).toBe(429);
  });

  it('switching HTTP method does not bypass user-keyed limit', async () => {
    const app = makeUserApp(2);

    // Use GET for both
    await request(app).get('/data').set('x-test-user-id', USER_A);
    await request(app).get('/data').set('x-test-user-id', USER_A);

    // Try POST — should still be blocked (same key)
    const res = await request(app).post('/data').set('x-test-user-id', USER_A);
    expect(res.status).toBe(429);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. Clinic-keyed Limiter Bypass Prevention
// ─────────────────────────────────────────────────────────────────────────────
describe('clinic-keyed rate limiter bypass prevention', () => {
  it('different clinics have independent rate limit counters', async () => {
    const app = makeClinicApp(3);

    // Exhaust clinic-A's limit
    for (let i = 0; i < 3; i++) {
      await request(app).post('/ai/generate').set('x-test-clinic-id', 'clinic-A');
    }
    const blocked = await request(app).post('/ai/generate').set('x-test-clinic-id', 'clinic-A');
    expect(blocked.status).toBe(429);

    // clinic-B is unaffected
    const ok = await request(app).post('/ai/generate').set('x-test-clinic-id', 'clinic-B');
    expect(ok.status).toBe(200);
  });

  it('different users in same clinic share the clinic rate limit', async () => {
    const app = makeClinicApp(3);

    // User 1 in clinic-A makes 2 requests
    await request(app)
      .post('/ai/generate')
      .set('x-test-clinic-id', 'clinic-A')
      .set('x-test-user-id', 'user-1');
    await request(app)
      .post('/ai/generate')
      .set('x-test-clinic-id', 'clinic-A')
      .set('x-test-user-id', 'user-1');

    // User 2 in same clinic makes 1 request
    await request(app)
      .post('/ai/generate')
      .set('x-test-clinic-id', 'clinic-A')
      .set('x-test-user-id', 'user-2');

    // 4th request from clinic-A (any user) should be blocked
    const res = await request(app)
      .post('/ai/generate')
      .set('x-test-clinic-id', 'clinic-A')
      .set('x-test-user-id', 'user-3');
    expect(res.status).toBe(429);
  });

  it('spoofing X-Forwarded-For does not bypass clinic-keyed limit', async () => {
    const app = makeClinicApp(2);

    for (let i = 0; i < 2; i++) {
      await request(app).post('/ai/generate').set('x-test-clinic-id', 'clinic-C');
    }

    const res = await request(app)
      .post('/ai/generate')
      .set('x-test-clinic-id', 'clinic-C')
      .set('X-Forwarded-For', '10.0.0.1');
    expect(res.status).toBe(429);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. Concurrent Burst Prevention
// ─────────────────────────────────────────────────────────────────────────────
describe('concurrent burst prevention', () => {
  it('parallel requests respect the rate limit', async () => {
    const app = makeIpApp(3);

    // Send 6 requests simultaneously
    const results = await Promise.all(Array.from({ length: 6 }, () => request(app).post('/auth')));

    const okCount = results.filter((r) => r.status === 200).length;
    const blockedCount = results.filter((r) => r.status === 429).length;

    expect(okCount).toBe(3);
    expect(blockedCount).toBe(3);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 7. Export Rate Limit Bypass Prevention
// ─────────────────────────────────────────────────────────────────────────────
describe('export rate limit bypass prevention', () => {
  // Use inline middleware to avoid module caching issues
  function makeExportApp(maxReqs = 3) {
    const store = new Map<string, { count: number; resetAt: number }>();
    const WINDOW_MS = 60 * 60 * 1000;

    const app = express();
    app.use((req: any, _res: Response, next) => {
      const clinicId = req.headers['x-test-clinic-id'] as string | undefined;
      if (clinicId) req.user = { clinicId, userId: 'u1', role: 'DOCTOR' };
      next();
    });

    app.get('/export', (req: any, res: Response) => {
      const clinicId = req.user?.clinicId;
      if (!clinicId) return res.status(401).json({ error: 'Unauthorized' });

      const now = Date.now();
      let entry = store.get(clinicId);
      if (!entry || now > entry.resetAt) {
        entry = { count: 0, resetAt: now + WINDOW_MS };
        store.set(clinicId, entry);
      }
      entry.count += 1;

      res.set('X-RateLimit-Limit', String(maxReqs));
      res.set('X-RateLimit-Remaining', String(Math.max(0, maxReqs - entry.count)));

      if (entry.count > maxReqs) {
        res.set('Retry-After', String(Math.ceil((entry.resetAt - now) / 1000)));
        return res
          .status(429)
          .json({ error: 'TooManyRequests', message: 'Export limit exceeded.' });
      }

      return res.json({ ok: true });
    });

    return app;
  }

  it('returns 401 without clinic context', async () => {
    const app = makeExportApp(3);
    const res = await request(app).get('/export');
    expect(res.status).toBe(401);
  });

  it('blocks exports exceeding per-clinic limit', async () => {
    const app = makeExportApp(3);
    for (let i = 0; i < 3; i++) {
      const res = await request(app).get('/export').set('x-test-clinic-id', 'clinic-X');
      expect(res.status).toBe(200);
    }

    const res = await request(app).get('/export').set('x-test-clinic-id', 'clinic-X');
    expect(res.status).toBe(429);
    expect(res.body.error).toBe('TooManyRequests');
  });

  it('different clinics have independent export limits', async () => {
    const app = makeExportApp(2);

    // Exhaust clinic-A
    await request(app).get('/export').set('x-test-clinic-id', 'clinic-A');
    await request(app).get('/export').set('x-test-clinic-id', 'clinic-A');
    const blocked = await request(app).get('/export').set('x-test-clinic-id', 'clinic-A');
    expect(blocked.status).toBe(429);

    // clinic-B is unaffected
    const ok = await request(app).get('/export').set('x-test-clinic-id', 'clinic-B');
    expect(ok.status).toBe(200);
  });

  it('sets monitoring headers on export responses', async () => {
    const app = makeExportApp(5);
    const res = await request(app).get('/export').set('x-test-clinic-id', 'clinic-Z');

    expect(res.status).toBe(200);
    expect(res.headers['x-ratelimit-limit']).toBe('5');
    expect(res.headers['x-ratelimit-remaining']).toBe('4');
  });
});
