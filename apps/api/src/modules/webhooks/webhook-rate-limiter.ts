/**
 * #1253 — Per-webhook delivery rate limiting.
 *
 * Protects a subscriber endpoint from bursts: at most `limitPerMin` deliveries
 * are enqueued for a given webhook in any rolling 60-second window. Excess
 * events are recorded as `dead` deliveries with a rate-limit error so they
 * are visible in the delivery history rather than silently lost.
 *
 * Uses a process-local sliding window. For a multi-instance deployment this
 * bounds each instance independently; pair it with a small delivery
 * concurrency per instance for a global ceiling.
 */

const WINDOW_MS = 60_000;

// webhookId -> ascending list of delivery timestamps within the window
const windows = new Map<string, number[]>();

export interface RateLimitDecision {
  allowed: boolean;
  remaining: number;
  retryAfterMs: number;
}

export function consumeWebhookRateLimit(
  webhookId: string,
  limitPerMin: number,
  now: number = Date.now()
): RateLimitDecision {
  if (!limitPerMin || limitPerMin <= 0) {
    return { allowed: true, remaining: Number.POSITIVE_INFINITY, retryAfterMs: 0 };
  }

  const cutoff = now - WINDOW_MS;
  const hits = (windows.get(webhookId) ?? []).filter((t) => t > cutoff);

  if (hits.length >= limitPerMin) {
    windows.set(webhookId, hits);
    const retryAfterMs = Math.max(0, hits[0] + WINDOW_MS - now);
    return { allowed: false, remaining: 0, retryAfterMs };
  }

  hits.push(now);
  windows.set(webhookId, hits);
  return { allowed: true, remaining: limitPerMin - hits.length, retryAfterMs: 0 };
}

/** Test helper. */
export function __resetWebhookRateLimiter(): void {
  windows.clear();
}
