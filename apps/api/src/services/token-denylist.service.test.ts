/**
 * Unit tests for token-denylist.service.ts
 */

// ── Mocks ─────────────────────────────────────────────────────────────────────
const mockStore: Record<string, unknown> = {};

jest.mock('@api/services/cache.service', () => ({
  cache: {
    get: jest.fn(async (key: string) => mockStore[key] ?? null),
    set: jest.fn(async (key: string, value: unknown, _ttl: number) => {
      mockStore[key] = value;
    }),
  },
}));

import {
  addToDenylist,
  isDenylisted,
  setUserInvalidatedAt,
  isInvalidatedForUser,
} from './token-denylist.service';

beforeEach(() => {
  Object.keys(mockStore).forEach((k) => delete mockStore[k]);
  jest.clearAllMocks();
});

describe('addToDenylist + isDenylisted', () => {
  it('returns true for a denylisted jti', async () => {
    await addToDenylist('jti-abc', 900);
    expect(await isDenylisted('jti-abc')).toBe(true);
  });

  it('returns false for an unknown jti', async () => {
    expect(await isDenylisted('jti-unknown')).toBe(false);
  });

  it('does not store entry when ttl <= 0 (already expired)', async () => {
    await addToDenylist('jti-expired', 0);
    expect(await isDenylisted('jti-expired')).toBe(false);
  });

  it('stores with correct TTL', async () => {
    const { cache } = await import('@api/services/cache.service');
    await addToDenylist('jti-ttl', 300);
    expect(cache.set).toHaveBeenCalledWith('token-denylist:jti-ttl', 1, 300);
  });
});

describe('setUserInvalidatedAt + isInvalidatedForUser', () => {
  it('rejects tokens issued before the invalidation timestamp', async () => {
    const now = Math.floor(Date.now() / 1000);
    await setUserInvalidatedAt('user-1', now);
    // Token issued 60 seconds before logout-all
    expect(await isInvalidatedForUser('user-1', now - 60)).toBe(true);
  });

  it('accepts tokens issued after the invalidation timestamp', async () => {
    const now = Math.floor(Date.now() / 1000);
    await setUserInvalidatedAt('user-1', now - 300);
    // Token issued after the invalidation
    expect(await isInvalidatedForUser('user-1', now)).toBe(false);
  });

  it('returns false when no invalidation timestamp is set', async () => {
    expect(await isInvalidatedForUser('user-no-logout-all', 9999999999)).toBe(false);
  });

  it('stores invalidation timestamp with 7-day TTL', async () => {
    const { cache } = await import('@api/services/cache.service');
    const ts = Math.floor(Date.now() / 1000);
    await setUserInvalidatedAt('user-2', ts);
    expect(cache.set).toHaveBeenCalledWith(
      'user-invalidated:user-2',
      ts,
      7 * 24 * 60 * 60,
    );
  });
});
