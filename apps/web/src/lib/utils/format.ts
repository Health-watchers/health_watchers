/**
 * Shared formatting utilities.
 * Date/time functions are re-exported from @health-watchers/utils.
 */

export {
  formatDate,
  formatDateTime,
  formatScheduleDate,
  formatTime,
  formatRelativeTime,
} from '@health-watchers/utils';

// ── String / ID ───────────────────────────────────────────────────────

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
