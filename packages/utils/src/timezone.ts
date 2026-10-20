/**
 * Timezone conversion utilities.
 * Provides helpers for converting between UTC and local time,
 * and for working with timezone offsets.
 */

/**
 * Returns the UTC offset in minutes for the given date.
 * Positive values mean the local timezone is ahead of UTC.
 */
export function getUtcOffset(date: Date | string = new Date()): number {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.getTimezoneOffset() * -1;
}

/**
 * Returns the UTC offset as a formatted string, e.g. "+05:30" or "-08:00".
 */
export function getUtcOffsetString(date: Date | string = new Date()): string {
  const offsetMinutes = getUtcOffset(date);
  const hours = Math.floor(Math.abs(offsetMinutes) / 60);
  const minutes = Math.abs(offsetMinutes) % 60;
  const sign = offsetMinutes >= 0 ? '+' : '-';
  return `${sign}${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

/**
 * Converts a Date to an ISO string adjusted to the given UTC offset in minutes.
 * Useful for displaying times in a specific timezone.
 */
export function toOffsetIsoString(date: Date | string, offsetMinutes: number): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const utc = d.getTime() + d.getTimezoneOffset() * 60000;
  const offsetMs = offsetMinutes * 60000;
  const adjusted = new Date(utc + offsetMs);
  return adjusted.toISOString();
}

/**
 * Converts a UTC ISO string to a local ISO string adjusted to the given UTC offset.
 */
export function utcToLocalIsoString(utcDate: string, offsetMinutes: number): string {
  return toOffsetIsoString(utcDate, offsetMinutes);
}

/**
 * Returns the IANA timezone name for the current environment,
 * e.g. "America/New_York" or "Europe/London".
 */
export function getLocalTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return 'UTC';
  }
}
