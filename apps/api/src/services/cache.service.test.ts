/**
 * Unit tests for cache.service.ts
 *
 * ioredis is replaced with a controllable mock. Each describe block resets the
 * module registry so the singletons (cached Redis client, hit/miss counters)
 * start from a clean state.
 */
jest.mock('ioredis', () => {
  class MockRedis {
    static last: MockRedis | null = null;
    handlers: Record<string, (err: Error) => void> = {};
    get = jest.fn();
    set = jest.fn();
    del = jest.fn();
    keys = jest.fn();
    scan = jest.fn();
    ping = jest.fn();
    constructor() {
      MockRedis.last = this;
    }
    on(ev: string, cb: (err: Error) => void) {
      this.handlers[ev] = cb;
      return this;
    }
  }
  return { __esModule: true, default: MockRedis };
});

jest.mock('../utils/logger', () => ({
  __esModule: true,
  default: { warn: jest.fn(), debug: jest.fn(), error: jest.fn(), info: jest.fn() },
}));

type RedisMockType = {
  last: {
    get: jest.Mock;
    set: jest.Mock;
    del: jest.Mock;
    keys: jest.Mock;
    scan: jest.Mock;
    ping: jest.Mock;
  } | null;
};

async function loadRedisMock(): Promise<RedisMockType> {
  const mod = (await import('ioredis')) as unknown as { default: RedisMockType };
  return mod.default;
}

describe('cache.service — disabled (no REDIS_URL)', () => {
  beforeAll(() => {
    jest.resetModules();
    process.env.REDIS_URL = '';
  });

  afterAll(() => {
    delete process.env.REDIS_URL;
  });

  it('get returns null on the disabled path and records a miss', async () => {
    const { cache, getCacheMetrics } = await import('./cache.service');
    expect(await cache.get('missing')).toBeNull();
    expect(getCacheMetrics().misses).toBe(1);
  });

  it('hitRate is 0 when there is no traffic', async () => {
    const { getCacheMetrics } = await import('./cache.service');
    expect(getCacheMetrics().hitRate).toBe(0);
  });

  it('set/del/delPattern are no-ops when disabled', async () => {
    const { cache } = await import('./cache.service');
    await expect(cache.set('k', { a: 1 }, 60)).resolves.toBeUndefined();
    await expect(cache.del('k')).resolves.toBeUndefined();
    await expect(cache.delPattern('a:*')).resolves.toBeUndefined();
  });

  it('ping reports disabled when no client exists', async () => {
    const { cache } = await import('./cache.service');
    expect(await cache.ping()).toEqual({ status: 'disabled' });
  });
});

describe('cache.service — enabled (REDIS_URL set)', () => {
  let redis: RedisMockType;

  beforeAll(async () => {
    jest.resetModules();
    process.env.REDIS_URL = 'redis://localhost:6379';
    redis = await loadRedisMock();
    redis.last = null;
  });

  afterAll(() => {
    delete process.env.REDIS_URL;
  });

  it('registers a client and handles hits, misses and get errors', async () => {
    const { cache, getCacheMetrics } = await import('./cache.service');

    // The Redis client is created lazily on first use — prime it so the
    // controllable mock instance exists before we set up get() behaviour.
    await cache.ping();

    // miss
    redis.last!.get.mockResolvedValue(null);
    expect(await cache.get('nope')).toBeNull();

    // hit
    redis.last!.get.mockResolvedValue(JSON.stringify({ user: 'x' }));
    expect(await cache.get('user:1')).toEqual({ user: 'x' });

    // get error falls through to DB
    redis.last!.get.mockRejectedValue(new Error('conn reset'));
    expect(await cache.get('user:1')).toBeNull();

    const metrics = getCacheMetrics();
    expect(metrics.hits).toBe(1);
    expect(metrics.misses).toBe(2);
    expect(metrics.hitRate).toBeCloseTo(0.3333, 3);
  });

  it('set forwards serialized value + TTL to Redis', async () => {
    const { cache } = await import('./cache.service');
    await cache.set('k', { a: 1 }, 60);
    expect(redis.last!.set).toHaveBeenCalledWith('k', JSON.stringify({ a: 1 }), 'EX', 60);
  });

  it('delPattern deletes matching keys and no-ops when there are none', async () => {
    const { cache } = await import('./cache.service');

    // SCAN returns [nextCursor, keys]; a '0' cursor ends the iteration
    redis.last!.scan.mockResolvedValue(['0', ['a:1', 'a:2']]);
    await cache.delPattern('a:*');
    expect(redis.last!.scan).toHaveBeenCalledWith('0', 'MATCH', 'a:*', 'COUNT', 100);
    expect(redis.last!.del).toHaveBeenCalledWith('a:1', 'a:2');

    redis.last!.scan.mockResolvedValue(['0', []]);
    redis.last!.del.mockClear();
    await cache.delPattern('empty:*');
    expect(redis.last!.del).not.toHaveBeenCalled();
  });

  it('set/del swallow redis errors', async () => {
    const { cache } = await import('./cache.service');
    redis.last!.set.mockRejectedValueOnce(new Error('boom'));
    await expect(cache.set('k2', {}, 10)).resolves.toBeUndefined();
    redis.last!.del.mockRejectedValueOnce(new Error('boom'));
    await expect(cache.del('k')).resolves.toBeUndefined();
  });

  it('ping reports healthy/unhealthy based on redis ping', async () => {
    const { cache } = await import('./cache.service');
    redis.last!.ping.mockResolvedValue('PONG');
    expect(await cache.ping()).toEqual({ status: 'healthy', latency: expect.any(Number) });

    redis.last!.ping.mockRejectedValue(new Error('down'));
    expect(await cache.ping()).toEqual({ status: 'unhealthy' });
  });
});
