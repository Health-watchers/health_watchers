import { TtlCache, buildCheckCacheKey } from '../interaction-cache';

describe('TtlCache', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('stores and retrieves values', () => {
    const cache = new TtlCache<number>({ ttlMs: 1000 });
    cache.set('a', 42);
    expect(cache.get('a')).toBe(42);
  });

  it('expires entries after TTL', () => {
    const cache = new TtlCache<number>({ ttlMs: 1000 });
    cache.set('a', 42);
    jest.advanceTimersByTime(1001);
    expect(cache.get('a')).toBeNull();
  });

  it('respects per-set ttl override', () => {
    const cache = new TtlCache<number>({ ttlMs: 1000 });
    cache.set('a', 42, 100);
    jest.advanceTimersByTime(101);
    expect(cache.get('a')).toBeNull();
  });

  it('returns null for missing keys', () => {
    const cache = new TtlCache<string>();
    expect(cache.get('nope')).toBeNull();
  });

  it('evicts oldest entry when over capacity', () => {
    const cache = new TtlCache<number>({ ttlMs: 10000, maxEntries: 2 });
    cache.set('a', 1);
    cache.set('b', 2);
    cache.set('c', 3);
    expect(cache.get('a')).toBeNull();
    expect(cache.get('b')).toBe(2);
    expect(cache.get('c')).toBe(3);
  });

  it('tracks hit rate stats', () => {
    const cache = new TtlCache<number>({ ttlMs: 1000 });
    cache.set('a', 1);
    cache.get('a');
    cache.get('b');
    expect(cache.stats.hits).toBe(1);
    expect(cache.stats.misses).toBe(1);
    expect(cache.stats.hitRate).toBe(0.5);
  });

  it('clears all entries', () => {
    const cache = new TtlCache<number>();
    cache.set('a', 1);
    cache.set('b', 2);
    cache.clear();
    expect(cache.get('a')).toBeNull();
    expect(cache.get('b')).toBeNull();
  });
});

describe('buildCheckCacheKey', () => {
  it('is order-insensitive for medications', () => {
    const a = buildCheckCacheKey({ medications: ['Warfarin', 'aspirin'], includeFood: true });
    const b = buildCheckCacheKey({ medications: ['aspirin', 'WARFARIN'], includeFood: true });
    expect(a).toBe(b);
  });

  it('normalizes case and whitespace', () => {
    const a = buildCheckCacheKey({ medications: ['  Warfarin '], includeFood: false });
    const b = buildCheckCacheKey({ medications: ['warfarin'], includeFood: false });
    expect(a).toBe(b);
  });

  it('differs when includeFood changes', () => {
    const a = buildCheckCacheKey({ medications: ['warfarin'], includeFood: true });
    const b = buildCheckCacheKey({ medications: ['warfarin'], includeFood: false });
    expect(a).not.toBe(b);
  });

  it('incorporates allergies order-insensitively', () => {
    const a = buildCheckCacheKey({
      medications: ['warfarin'],
      allergies: [{ allergen: 'penicillin' }, { allergen: 'aspirin', severity: 'severe' }],
      includeFood: true,
    });
    const b = buildCheckCacheKey({
      medications: ['warfarin'],
      allergies: [{ allergen: 'aspirin', severity: 'severe' }, { allergen: 'penicillin' }],
      includeFood: true,
    });
    expect(a).toBe(b);
  });
});
