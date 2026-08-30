/**
 * In-memory interaction cache (Issue #1244)
 *
 * The interaction engine is fast, but resolution + pairwise checks against a
 * growing database can add up on hot medication lists. This TTL cache keeps
 * per-patient check results (and full-database snapshots) in memory so the
 * <500ms acceptance target holds even without Redis configured.
 */
import logger from '../../utils/logger';

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

const DEFAULT_TTL_MS = 5 * 60 * 1000; // 5 minutes

export class TtlCache<T> {
  private store = new Map<string, CacheEntry<T>>();
  private hits = 0;
  private misses = 0;
  private readonly ttlMs: number;
  private readonly maxEntries: number;

  constructor(options: { ttlMs?: number; maxEntries?: number } = {}) {
    this.ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
    this.maxEntries = options.maxEntries ?? 1000;
  }

  get(key: string): T | null {
    const entry = this.store.get(key);
    if (!entry) {
      this.misses++;
      return null;
    }
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      this.misses++;
      return null;
    }
    this.hits++;
    return entry.value;
  }

  set(key: string, value: T, ttlMs?: number): void {
    // Evict expired entries opportunistically; drop oldest if over capacity.
    if (this.store.size >= this.maxEntries) {
      const now = Date.now();
      for (const [k, v] of this.store) {
        if (v.expiresAt <= now) this.store.delete(k);
      }
      if (this.store.size >= this.maxEntries) {
        const oldestKey = this.store.keys().next().value;
        if (oldestKey !== undefined) this.store.delete(oldestKey);
      }
    }
    this.store.set(key, { value, expiresAt: Date.now() + (ttlMs ?? this.ttlMs) });
  }

  del(key: string): void {
    this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
  }

  get stats() {
    const total = this.hits + this.misses;
    return {
      size: this.store.size,
      hits: this.hits,
      misses: this.misses,
      hitRate: total === 0 ? 0 : +(this.hits / total).toFixed(4),
    };
  }
}

// ── Shared instances ──────────────────────────────────────────────────────────
// Per-medication-list check results — keyed by a stable hash of the input.
export const checkResultCache = new TtlCache<unknown>({ ttlMs: 5 * 60 * 1000, maxEntries: 2000 });

// Database snapshot of merged interaction rows — invalidated by refresh/import.
export const interactionDataCache = new TtlCache<unknown>({
  ttlMs: 10 * 60 * 1000,
  maxEntries: 10,
});

/**
 * Stable string key for a check request so identical requests hit the cache.
 * Key order is normalized (sorted) so ["warfarin","aspirin"] === ["aspirin","warfarin"].
 */
export function buildCheckCacheKey(input: {
  medications: string[];
  allergies?: Array<{ allergen: string; severity?: string }>;
  includeFood: boolean;
}): string {
  const meds = [...input.medications]
    .map((m) => m.toLowerCase().trim())
    .sort()
    .join('|');
  const allergies = (input.allergies ?? [])
    .map((a) => `${a.allergen.toLowerCase().trim()}:${a.severity ?? ''}`)
    .sort()
    .join('|');
  return `check:${meds}::${allergies}::food=${input.includeFood}`;
}

/** Log cache stats periodically (unref'd so it never keeps the process alive). */
setInterval(
  () => {
    logger.info(
      { checkCache: checkResultCache.stats, dataCache: interactionDataCache.stats },
      '[interactions] cache hit-rate report'
    );
  },
  10 * 60 * 1000
).unref();
