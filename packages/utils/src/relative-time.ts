/**
 * Relative time formatting utilities.
 * Produces human-readable strings like "3 minutes ago" or "in 2 days".
 */

interface RelativeTimeOptions {
  /** Whether to include the "in X" prefix for future dates (default: true) */
  includeFuture?: boolean;
  /** Threshold in seconds to switch to date formatting instead of relative */
  fallbackThreshold?: number;
}

/**
 * Returns a human-readable relative time string for the given date.
 * e.g. "3 minutes ago", "in 2 days", "just now"
 */
export function formatRelativeTime(
  date: Date | string,
  options?: RelativeTimeOptions
): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const now = new Date();
  const diffMs = d.getTime() - now.getTime();
  const diffSec = Math.round(diffMs / 1000);
  const diffMin = Math.round(diffSec / 60);
  const diffHr = Math.round(diffMin / 60);
  const diffDay = Math.round(diffHr / 24);

  const includeFuture = options?.includeFuture ?? true;
  const fallbackThreshold = options?.fallbackThreshold ?? 7 * 24 * 60 * 60;

  // If the difference is larger than the fallback threshold, return the formatted date
  if (Math.abs(diffSec) > fallbackThreshold) {
    return formatDateFallback(d);
  }

  if (Math.abs(diffSec) < 60) {
    return 'just now';
  }

  if (diffSec < 0) {
    // Past
    if (diffMin < 60) return `${diffMin} minute${diffMin !== 1 ? 's' : ''} ago`;
    if (diffHr < 24) return `${diffHr} hour${diffHr !== 1 ? 's' : ''} ago`;
    if (diffDay < 30) return `${diffDay} day${diffDay !== 1 ? 's' : ''} ago`;
    return formatDateFallback(d);
  }

  // Future
  if (!includeFuture) return formatDateFallback(d);
  if (diffMin < 60) return `in ${diffMin} minute${diffMin !== 1 ? 's' : ''}`;
  if (diffHr < 24) return `in ${diffHr} hour${diffHr !== 1 ? 's' : ''}`;
  if (diffDay < 30) return `in ${diffDay} day${diffDay !== 1 ? 's' : ''}`;
  return formatDateFallback(d);
}

/**
 * Returns a short relative time label, e.g. "2m", "3h", "5d".
 */
export function formatRelativeTimeShort(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const now = new Date();
  const diffMs = d.getTime() - now.getTime();
  const diffSec = Math.round(diffMs / 1000);
  const diffMin = Math.round(diffSec / 60);
  const diffHr = Math.round(diffMin / 60);
  const diffDay = Math.round(diffHr / 24);

  if (Math.abs(diffSec) < 60) return 'now';
  if (diffSec < 0) {
    if (diffMin < 60) return `${diffMin}m`;
    if (diffHr < 24) return `${diffHr}h`;
    if (diffDay < 30) return `${diffDay}d`;
    return formatDateFallback(d);
  }
  if (diffMin < 60) return `in ${diffMin}m`;
  if (diffHr < 24) return `in ${diffHr}h`;
  if (diffDay < 30) return `in ${diffDay}d`;
  return formatDateFallback(d);
}

function formatDateFallback(d: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(d);
}
