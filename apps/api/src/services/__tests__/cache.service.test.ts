/**
 * Unit tests for cache.service.ts — Issue #1071: Redis Cache Strategy
 *
 * Covers:
 *  - get / set / del with Redis mock
 *  - delPattern using SCAN-based key deletion
 *  - invalidatePatientList and invalidateReports
 *  - registerWarmup and warmCache
 *  - Cache hit/miss metrics tracking
 *  - Graceful fallback when Redis is unavailable
 */

// ── Environment stubs ────────────────────────────────────────────────────────
process.env.REDIS_URL = 'redis://localhost:6379';

// ── Logger mock ───────────────────────────────────────────────────────────────
jest.mock('@api/utils/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

// ── ioredis mock ──────────────────────────────────────────────────────────────
const mockRedisStore = new Map<string, string>();
const mockRedis = {
  get: jest.fn(async (key: string) => mockRedisStore.get(key) ?? null),
  set: jest.fn(async (key: string, value: string, _ex: string, _ttl: number) => {
    mockRedisStore.set(key, value);
    return 'OK';
  }),
  del: jest.fn(async (...keys: string[]) => {
    keys.forEach((k) => mockRedisStore.delete(k));
    return keys.length;
  }),
  scan: jest.fn(async (_cursor: string, _match: string, pattern: string, _count: string, _n: number) => {
    const matched = [...mockRedisStore.keys()].filter((k) => {
      // Simple glob matching for tests (replaces * with .*)
      const re = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
      return re.test(k);
    });
    return ['0', matched];
  }),
  exists: jest.fn(async (key: string) => (mockRedisStore.has(key) ? 1 : 0)),
  ping: jest.fn(async () => 'PONG'),
  on: jest.fn(),
};

jest.mock('ioredis', () => {
  return jest.fn().mockImplementation(() => mockRedis);
});

// ── Import after mocks ────────────────────────────────────────────────────────
import {
  cache,
  getCacheMetrics,
  resetCacheMetrics,
  registerWarmup,
  warmCache,
} from '../cache.service';

// ── Helpers ───────────────────────────────────────────────────────────────────
beforeEach(() => {
  mockRedisStore.clear();
  jest.clearAllMocks();
  resetCacheMetrics();
});

// ── cache.get ─────────────────────────────────────────────────────────────────
describe('cache.get', () => {
  it('returns null and counts a miss when key is absent', async () => {
    const result = await cache.get('missing-key');
    expect(result).toBeNull();
    expect(getCacheMetrics().misses).toBe(1);
    expect(getCacheMetrics().hits).toBe(0);
  });

  it('returns parsed value and counts a hit when key is present', async () => {
    mockRedisStore.set('test-key', JSON.stringify({ hello: 'world' }));
    const result = await cache.get<{ hello: string }>('test-key');
    expect(result).toEqual({ hello: 'world' });
    expect(getCacheMetrics().hits).toBe(1);
    expect(getCacheMetrics().misses).toBe(0);
  });

  it('returns null and counts a miss on Redis error', async () => {
    mockRedis.get.mockRejectedValueOnce(new Error('Redis connection error'));
    const result = await cache.get('error-key');
    expect(result).toBeNull();
    expect(getCacheMetrics().misses).toBe(1);
  });
});

// ── cache.set ─────────────────────────────────────────────────────────────────
describe('cache.set', () => {
  it('stores a JSON-serialised value with TTL', async () => {
    await cache.set('my-key', { data: [1, 2, 3] }, 300);
    expect(mockRedis.set).toHaveBeenCalledWith(
      'my-key',
      JSON.stringify({ data: [1, 2, 3] }),
      'EX',
      300
    );
  });

  it('does not throw on Redis error', async () => {
    mockRedis.set.mockRejectedValueOnce(new Error('Write error'));
    await expect(cache.set('key', 'value', 60)).resolves.toBeUndefined();
  });
});

// ── cache.del ─────────────────────────────────────────────────────────────────
describe('cache.del', () => {
  it('deletes a key from the store', async () => {
    mockRedisStore.set('to-delete', 'value');
    await cache.del('to-delete');
    expect(mockRedis.del).toHaveBeenCalledWith('to-delete');
  });
});

// ── cache.delPattern ──────────────────────────────────────────────────────────
describe('cache.delPattern', () => {
  it('deletes all keys matching the glob pattern', async () => {
    mockRedisStore.set('patients:list:clinic1:page=1:limit=20', 'v1');
    mockRedisStore.set('patients:list:clinic1:page=2:limit=20', 'v2');
    mockRedisStore.set('patients:list:clinic2:page=1:limit=20', 'v3');

    await cache.delPattern('patients:list:clinic1:*');

    expect(mockRedisStore.has('patients:list:clinic1:page=1:limit=20')).toBe(false);
    expect(mockRedisStore.has('patients:list:clinic1:page=2:limit=20')).toBe(false);
    // Different clinic should not be deleted
    expect(mockRedisStore.has('patients:list:clinic2:page=1:limit=20')).toBe(true);
  });

  it('is a no-op when no keys match', async () => {
    await expect(cache.delPattern('nonexistent:*')).resolves.toBeUndefined();
    expect(mockRedis.del).not.toHaveBeenCalled();
  });
});

// ── cache.invalidatePatientList ───────────────────────────────────────────────
describe('cache.invalidatePatientList', () => {
  it('removes all cached pages for a clinic', async () => {
    const clinicId = 'clinic-abc-123';
    mockRedisStore.set(`patients:list:${clinicId}:page=1:limit=20`, 'p1');
    mockRedisStore.set(`patients:list:${clinicId}:page=2:limit=20`, 'p2');
    mockRedisStore.set(`patients:list:other-clinic:page=1:limit=20`, 'other');

    await cache.invalidatePatientList(clinicId);

    expect(mockRedisStore.has(`patients:list:${clinicId}:page=1:limit=20`)).toBe(false);
    expect(mockRedisStore.has(`patients:list:${clinicId}:page=2:limit=20`)).toBe(false);
    expect(mockRedisStore.has(`patients:list:other-clinic:page=1:limit=20`)).toBe(true);
  });
});

// ── cache.invalidateReports ───────────────────────────────────────────────────
describe('cache.invalidateReports', () => {
  it('removes all report cache entries for a clinic', async () => {
    const clinicId = 'clinic-xyz';
    mockRedisStore.set(`${clinicId}:GET:/reports/overview`, 'r1');
    mockRedisStore.set(`${clinicId}:GET:/reports/patients`, 'r2');
    mockRedisStore.set(`other-clinic:GET:/reports/overview`, 'r3');

    await cache.invalidateReports(clinicId);

    expect(mockRedisStore.has(`${clinicId}:GET:/reports/overview`)).toBe(false);
    expect(mockRedisStore.has(`${clinicId}:GET:/reports/patients`)).toBe(false);
    expect(mockRedisStore.has(`other-clinic:GET:/reports/overview`)).toBe(true);
  });
});

// ── Hit rate metrics ──────────────────────────────────────────────────────────
describe('getCacheMetrics', () => {
  it('reports zero hit rate when no operations have occurred', () => {
    const metrics = getCacheMetrics();
    expect(metrics.hits).toBe(0);
    expect(metrics.misses).toBe(0);
    expect(metrics.hitRate).toBe(0);
  });

  it('calculates hit rate correctly after mixed hits and misses', async () => {
    mockRedisStore.set('k1', JSON.stringify('v1'));
    mockRedisStore.set('k2', JSON.stringify('v2'));
    await cache.get('k1'); // hit
    await cache.get('k2'); // hit
    await cache.get('k3'); // miss
    await cache.get('k4'); // miss

    const metrics = getCacheMetrics();
    expect(metrics.hits).toBe(2);
    expect(metrics.misses).toBe(2);
    expect(metrics.hitRate).toBeCloseTo(0.5, 2);
  });

  it('rounds hit rate to 4 decimal places', async () => {
    mockRedisStore.set('k1', JSON.stringify(1));
    await cache.get('k1'); // hit
    await cache.get('miss1'); // miss
    await cache.get('miss2'); // miss

    const { hitRate } = getCacheMetrics();
    // 1/3 = 0.3333...
    expect(hitRate).toBe(0.3333);
  });
});

// ── registerWarmup + warmCache ────────────────────────────────────────────────
describe('registerWarmup and warmCache', () => {
  it('fills a cold key using the registered loader', async () => {
    const testKey = 'warmup-test-key';
    const testValue = { warmed: true, items: [1, 2, 3] };

    registerWarmup({
      key: testKey,
      ttlSeconds: 120,
      loader: async () => testValue,
    });

    await warmCache();

    expect(mockRedis.set).toHaveBeenCalledWith(
      testKey,
      JSON.stringify(testValue),
      'EX',
      120
    );
  });

  it('skips warming when the key is already present', async () => {
    const testKey = 'already-warm-key';
    mockRedisStore.set(testKey, JSON.stringify({ cached: true }));
    mockRedis.exists.mockResolvedValueOnce(1);

    const loader = jest.fn().mockResolvedValue({ fresh: true });
    registerWarmup({ key: testKey, ttlSeconds: 60, loader });

    await warmCache();

    expect(loader).not.toHaveBeenCalled();
  });

  it('continues warming other keys when one loader fails', async () => {
    const goodKey = `warmup-good-${Date.now()}`;
    const badKey = `warmup-bad-${Date.now()}`;

    registerWarmup({
      key: badKey,
      ttlSeconds: 60,
      loader: async () => { throw new Error('loader failed'); },
    });
    registerWarmup({
      key: goodKey,
      ttlSeconds: 60,
      loader: async () => ({ ok: true }),
    });

    await expect(warmCache()).resolves.toBeUndefined();
    expect(mockRedis.set).toHaveBeenCalledWith(goodKey, JSON.stringify({ ok: true }), 'EX', 60);
  });
});

// ── cache.ping ────────────────────────────────────────────────────────────────
describe('cache.ping', () => {
  it('returns healthy status with latency when Redis responds', async () => {
    const result = await cache.ping();
    expect(result.status).toBe('healthy');
    expect(typeof result.latency).toBe('number');
  });

  it('returns unhealthy status when Redis ping fails', async () => {
    mockRedis.ping.mockRejectedValueOnce(new Error('Connection refused'));
    const result = await cache.ping();
    expect(result.status).toBe('unhealthy');
  });
});
