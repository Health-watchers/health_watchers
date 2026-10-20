/**
 * Date formatting utilities.
 * Consolidated from apps/web/src/lib/utils/format.ts and packages/types/src/index.ts.
 */

// ── Date & time ───────────────────────────────────────────────────────────

/**
 * Formats a date as "Jan 1, 2024".
 * Accepts a Date, ISO string, or undefined (returns 'N/A' for undefined).
 */
export function formatDate(date: Date | string | undefined): string {
  if (!date) return 'N/A';
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

// ── Age Calculation Utilities ────────────────────────────────────────────

export type AgeGroup = 'infant' | 'toddler' | 'child' | 'adolescent' | 'adult' | 'elderly';

/**
 * Calculates the age in whole years from a date of birth.
 */
export function calculateAge(dateOfBirth: Date | string): number {
  const dob = new Date(dateOfBirth);
  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const monthDiff = today.getMonth() - dob.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) age--;
  return age;
}

/**
 * Calculates the age in whole months from a date of birth.
 */
export function calculateAgeInMonths(dateOfBirth: Date | string): number {
  const dob = new Date(dateOfBirth);
  const today = new Date();
  return (today.getFullYear() - dob.getFullYear()) * 12 + (today.getMonth() - dob.getMonth());
}

/**
 * Returns the age group for a given age.
 */
export function getAgeGroup(age: number): AgeGroup {
  if (age < 1) return 'infant';
  if (age < 3) return 'toddler';
  if (age < 12) return 'child';
  if (age < 18) return 'adolescent';
  if (age < 65) return 'adult';
  return 'elderly';
}
