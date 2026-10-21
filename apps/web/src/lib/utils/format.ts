/**
 * Shared formatting utilities.
 * Centralises repeated date/time, currency, and string formatting
 * patterns that were previously duplicated across components.
 */

// ── Date & time ───────────────────────────────────────────────────────────────

/**
 * Formats a date as "Jan 1, 2024".
 */
export function formatDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(d);
}

/**
 * Formats a date as "Jan 1, 2024, 12:00:00 AM".
 */
export function formatDateTime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
  }).format(d);
}

/**
 * Formats a date as "Monday, Jan 1" (used in scheduling views).
 */
export function formatScheduleDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  });
}

/**
 * Formats a time value as "12:00 AM".
 */
export function formatTime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  }).format(d);
}

/**
 * Returns a relative time string such as "3 minutes ago" or "in 2 days".
 */
export function formatRelativeTime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const diffMs = d.getTime() - Date.now();
  const diffSec = Math.round(diffMs / 1_000);
  const absS = Math.abs(diffSec);

  const rtf = new Intl.RelativeTimeFormat('en-US', { numeric: 'auto' });

  if (absS < 60) return rtf.format(diffSec, 'second');
  if (absS < 3_600) return rtf.format(Math.round(diffSec / 60), 'minute');
  if (absS < 86_400) return rtf.format(Math.round(diffSec / 3_600), 'hour');
  return rtf.format(Math.round(diffSec / 86_400), 'day');
}

// ── String / ID ───────────────────────────────────────────────────────────────

/**
 * Truncates a long ID/hash for display, e.g. "abc123…" from "abc123def456".
 */
export function truncateId(id: string, chars = 12): string {
  if (id.length <= chars) return id;
  return `${id.slice(0, chars)}…`;
}

/**
 * Capitalises the first letter of a string.
 */
export function capitalize(str: string): string {
  if (!str) return str;
  return str.charAt(0).toUpperCase() + str.slice(1);
}
