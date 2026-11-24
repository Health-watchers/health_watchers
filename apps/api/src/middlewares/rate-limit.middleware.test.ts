import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Request, Response, NextFunction } from 'express';

// ---------------------------------------------------------------------------
// In-memory Redis fallback used by the rate limiter when no Redis client is
// available. The middleware module is expected to expose a way to reset this
// store between tests; we also mock the redis client module so the limiter
// falls back to the in-memory implementation deterministically.
// ---------------------------------------------------------------------------

vi.mock('../lib/redis', () => ({
  getRedisClient: () => null,
}));

// Prometheus metrics are mocked so we can assert increments without pulling in
// the real registry.
const metricIncrements: Array<{ name: string; labels: Record<string, string> }> = [];

vi.mock('../lib/metrics', () => {
  const makeCounter = (name: string) => ({
    inc: (labels: Record<string, string> = {}) => {
      metricIncrements.push({ name, labels });
    },
  });
  return {
    rateLimitHitsTotal: makeCounter('rate_limit_hits_total'),
    rateLimitRequestsTotal: makeCounter('rate_limit_requests_total'),
  };
});

import {
  createRateLimiter,
  rateLimiters,
  resetRateLimitStore,
  RATE_LIMIT_CONFIG,
} from './rate-limit.middleware';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

interface MockResponse {
  statusCode: number;
  headers: Record<string, string | number>;
  body: unknown;
  status: (code: number) => MockResponse;
  setHeader: (name: string, value: string | number) => MockResponse;
  getHeader: (name: string) => string | number | undefined;
  json: (body: unknown) => MockResponse;
  send: (body: unknown) => MockResponse;
  end: () => MockResponse;
}

function createMockResponse(): MockResponse {
  const res: MockResponse = {
    statusCode: 200,
    headers: {},
    body: undefined,
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    setHeader(name: string, value: string | number) {
      res.headers[name.toLowerCase()] = value;
      return res;
    },
    getHeader(name: string) {
      return res.headers[name.toLowerCase()];
    },
    json(body: unknown) {
      res.body = body;
      return res;
    },
    send(body: unknown) {
      res.body = body;
      return res;
    },
    end() {
      return res;
    },
  };
  return res;
}

function createMockRequest(overrides: Partial<Request> = {}): Request {
  return {
    ip: '203.0.113.7',
    method: 'POST',
    path: '/',
    headers: {},
    socket: { remoteAddress: '203.0.113.7' },
    ...overrides,
  } as unknown as Request;
}

interface CallResult {
  statusCode: number;
  headers: Record<string, string | number>;
  body: unknown;
  nextCalled: boolean;
}

async function invoke(
  middleware: (req: Request, res: Response, next: NextFunction) => unknown,
  req: Request,
): Promise<CallResult> {
  const res = createMockResponse();
  let nextCalled = false;
  const next: NextFunction = () => {
    nextCalled = true;
  };
  await middleware(req, res as unknown as Response, next);
  return {
    statusCode: res.statusCode,
    headers: res.headers,
    body: res.body,
    nextCalled,
  };
}

/**
 * Fires `count` requests in quick succession (burst) against the given
 * middleware and returns the results in order.
 */
async function fireBurst(
  middleware: (req: Request, res: Response, next: NextFunction) => unknown,
  count: number,
  reqFactory: () => Request = () => createMockRequest(),
): Promise<CallResult[]> {
  const results: CallResult[] = [];
  // Fire all requests without awaiting between them to simulate a burst.
  const pending = Array.from({ length: count }, () => invoke(middleware, reqFactory()));
  for (const p of pending) {
    results.push(await p);
  }
  return results;
}

function hitsFor(limiterName: string): number {
  return metricIncrements.filter(
    (m) => m.name === 'rate_limit_hits_total' && m.labels.limiter === limiterName,
  ).length;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('rate-limit middleware — burst traffic', () => {
  beforeEach(() => {
    metricIncrements.length = 0;
    resetRateLimitStore();
  });

  afterEach(() => {
    resetRateLimitStore();
    vi.clearAllMocks();
  });

  describe('sensitive route classification', () => {
    it('exposes stricter limits for auth, export, ai and portal/mfa routes', () => {
      const sensitive = ['authLogin', 'authRegister', 'export', 'ai', 'portalMfa'];
      for (const name of sensitive) {
        expect(RATE_LIMIT_CONFIG).toHaveProperty(name);
        const cfg = (RATE_LIMIT_CONFIG as Record<string, { max: number; windowMs: number }>)[name];
        expect(cfg.max).toBeGreaterThan(0);
        expect(cfg.windowMs).toBeGreaterThan(0);
      }
    });

    it('applies stricter limits to sensitive routes than the default limiter', () => {
      const defaultMax = RATE_LIMIT_CONFIG.default.max;
      for (const name of ['authLogin', 'authRegister', 'export', 'ai', 'portalMfa']) {
        const cfg = (RATE_LIMIT_CONFIG as Record<string, { max: number }>)[name];
        expect(cfg.max).toBeLessThanOrEqual(defaultMax);
      }
    });
  });

  describe.each([
    ['authLogin', '/auth/login'],
    ['authRegister', '/auth/register'],
    ['export', '/export/phi'],
    ['ai', '/ai/summarize'],
    ['portalMfa', '/portal/mfa/verify'],
  ])('%s limiter (%s)', (limiterName, routePath) => {
    it('allows up to the configured max then returns 429 with Retry-After on overflow', async () => {
      const limiter = createRateLimiter(limiterName as keyof typeof RATE_LIMIT_CONFIG);
      const cfg = (RATE_LIMIT_CONFIG as Record<string, { max: number; windowMs: number }>)[
        limiterName
      ];
      const max = cfg.max;

      const reqFactory = () =>
        createMockRequest({ path: routePath, method: 'POST' });

      const results = await fireBurst(limiter, max + 1, reqFactory);

      // First `max` requests pass through.
      for (let i = 0; i < max; i++) {
        expect(results[i].nextCalled).toBe(true);
        expect(results[i].statusCode).toBe(200);
      }

      // The overflow request is rejected.
      const overflow = results[max];
      expect(overflow.nextCalled).toBe(false);
      expect(overflow.statusCode).toBe(429);

      // Retry-After header present and a positive integer (seconds).
      const retryAfter = overflow.headers['retry-after'];
      expect(retryAfter).toBeDefined();
      const retryAfterNum = Number(retryAfter);
      expect(Number.isFinite(retryAfterNum)).toBe(true);
      expect(retryAfterNum).toBeGreaterThan(0);

      // RateLimit-* headers present on both allowed and rejected responses.
      for (const result of results) {
        expect(result.headers['ratelimit-limit']).toBeDefined();
        expect(result.headers['ratelimit-remaining']).toBeDefined();
        expect(result.headers['ratelimit-reset']).toBeDefined();
      }

      // Remaining decreases across allowed requests.
      expect(Number(results[0].headers['ratelimit-remaining'])).toBe(max - 1);
      expect(Number(results[max - 1].headers['ratelimit-remaining'])).toBe(0);
      expect(Number(overflow.headers['ratelimit-remaining'])).toBe(0);
      expect(Number(overflow.headers['ratelimit-limit'])).toBe(max);
    });

    it('increments rate_limit_hits_total for each rejected request', async () => {
      const limiter = createRateLimiter(limiterName as keyof typeof RATE_LIMIT_CONFIG);
      const cfg = (RATE_LIMIT_CONFIG as Record<string, { max: number }>)[limiterName];
      const max = cfg.max;
      const overflowCount = 3;

      const reqFactory = () => createMockRequest({ path: routePath, method: 'POST' });

      const before = hitsFor(limiterName);
      const results = await fireBurst(limiter, max + overflowCount, reqFactory);
      const after = hitsFor(limiterName);

      const rejected = results.filter((r) => r.statusCode === 429);
      expect(rejected).toHaveLength(overflowCount);
      expect(after - before).toBe(overflowCount);

      // Ensure the metric carries the limiter label.
      const hit = metricIncrements.find(
        (m) => m.name === 'rate_limit_hits_total' && m.labels.limiter === limiterName,
      );
      expect(hit).toBeDefined();
    });

    it('isolates limits per client IP', async () => {
      const limiter = createRateLimiter(limiterName as keyof typeof RATE_LIMIT_CONFIG);
      const cfg = (RATE_LIMIT_CONFIG as Record<string, { max: number }>)[limiterName];
      const max = cfg.max;

      // Exhaust the limit for IP A.
      const ipA = () => createMockRequest({ path: routePath, ip: '198.51.100.1' });
      const aResults = await fireBurst(limiter, max + 1, ipA);
      expect(aResults[max].statusCode).toBe(429);

      // IP B should still be allowed.
      const ipB = () => createMockRequest({ path: routePath, ip: '198.51.100.2' });
      const bResult = await invoke(limiter, ipB());
      expect(bResult.nextCalled).toBe(true);
      expect(bResult.statusCode).toBe(200);
    });
  });

  describe('sliding window behavior', () => {
    it('resets the counter after the window elapses', async () => {
      vi.useFakeTimers();
      try {
        const limiter = createRateLimiter('authLogin');
        const cfg = RATE_LIMIT_CONFIG.authLogin;
        const max = cfg.max;
        const reqFactory = () => createMockRequest({ path: '/auth/login', method: 'POST' });

        // Exhaust the window.
        const first = await fireBurst(limiter, max + 1, reqFactory);
        expect(first[max].statusCode).toBe(429);

        // Advance past the window.
        vi.advanceTimersByTime(cfg.windowMs + 1);

        const afterReset = await invoke(limiter, reqFactory());
        expect(afterReset.nextCalled).toBe(true);
        expect(afterReset.statusCode).toBe(200);
        expect(Number(afterReset.headers['ratelimit-remaining'])).toBe(max - 1);
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe('pre-configured rateLimiters', () => {
    it('provides a limiter for each sensitive route', () => {
      expect(rateLimiters).toHaveProperty('authLogin');
      expect(rateLimiters).toHaveProperty('authRegister');
      expect(rateLimiters).toHaveProperty('export');
      expect(rateLimiters).toHaveProperty('ai');
      expect(rateLimiters).toHaveProperty('portalMfa');
      for (const key of ['authLogin', 'authRegister', 'export', 'ai', 'portalMfa']) {
        expect(typeof (rateLimiters as Record<string, unknown>)[key]).toBe('function');
      }
    });

    it('rejects bursts on the pre-configured authLogin limiter', async () => {
      const limiter = rateLimiters.authLogin;
      const max = RATE_LIMIT_CONFIG.authLogin.max;
      const reqFactory = () => createMockRequest({ path: '/auth/login', method: 'POST' });

      const results = await fireBurst(limiter, max + 1, reqFactory);
      expect(results[max].statusCode).toBe(429);
      expect(results[max].headers['retry-after']).toBeDefined();
    });
  });
});