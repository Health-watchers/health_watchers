import logger from '@api/utils/logger';

interface SequenceCache {
  sequence: string;
  timestamp: number;
}

const CACHE_TTL_MS = 5 * 1000; // 5 seconds
const sequenceCache = new Map<string, SequenceCache>();

/**
 * Get cached sequence number for an account
 */
export function getCachedSequence(publicKey: string): string | null {
  const cached = sequenceCache.get(publicKey);
  if (!cached) return null;

  const age = Date.now() - cached.timestamp;
  if (age > CACHE_TTL_MS) {
    sequenceCache.delete(publicKey);
    return null;
  }

  return cached.sequence;
}

/**
 * Cache sequence number for an account
 */
export function cacheSequence(publicKey: string, sequence: string): void {
  sequenceCache.set(publicKey, {
    sequence,
    timestamp: Date.now(),
  });
  logger.debug({ publicKey, sequence }, 'Sequence number cached');
}

/**
 * Invalidate cached sequence for an account
 */
export function invalidateSequence(publicKey: string): void {
  sequenceCache.delete(publicKey);
  logger.debug({ publicKey }, 'Sequence number cache invalidated');
}

/**
 * Clear all cached sequences
 */
export function clearSequenceCache(): void {
  sequenceCache.clear();
  logger.debug('Sequence number cache cleared');
}
