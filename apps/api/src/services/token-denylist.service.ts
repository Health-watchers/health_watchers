import { cache } from '@api/services/cache.service';

const DENYLIST_PREFIX = 'token-denylist:';
const USER_INVALIDATED_PREFIX = 'user-invalidated:';

/** Add a jti to the denylist with a TTL matching the token's remaining lifetime. */
export async function addToDenylist(jti: string, ttlSeconds: number): Promise<void> {
  if (ttlSeconds > 0) {
    await cache.set(`${DENYLIST_PREFIX}${jti}`, 1, ttlSeconds);
  }
}

/** Returns true if the jti is in the denylist. */
export async function isDenylisted(jti: string): Promise<boolean> {
  const val = await cache.get<number>(`${DENYLIST_PREFIX}${jti}`);
  return val !== null;
}

/**
 * Store a per-user invalidation timestamp (logout-all).
 * All tokens issued before this timestamp will be rejected.
 * TTL is set to the max access token lifetime (15 min) to auto-expire.
 */
export async function setUserInvalidatedAt(userId: string, timestampSecs: number): Promise<void> {
  // Keep for 7 days (max refresh token lifetime) so re-used refresh tokens are also caught
  await cache.set(`${USER_INVALIDATED_PREFIX}${userId}`, timestampSecs, 7 * 24 * 60 * 60);
}

/**
 * Returns true if the token's iat is before the user's invalidation timestamp.
 */
export async function isInvalidatedForUser(userId: string, iat: number): Promise<boolean> {
  const invalidatedAt = await cache.get<number>(`${USER_INVALIDATED_PREFIX}${userId}`);
  if (invalidatedAt === null) return false;
  return iat < invalidatedAt;
}
