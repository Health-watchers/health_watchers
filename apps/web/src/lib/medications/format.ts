/** Small helpers shared by the medication manager components. */

/** ISO `yyyy-mm-dd` for the given date (defaults to now). */
export function todayIso(date: Date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

/** Client-side identifier for records created before the API assigns an _id. */
export function makeId(prefix: string): string {
  const random = Math.random().toString(36).slice(2, 8);
  return `${prefix}-${Date.now().toString(36)}-${random}`;
}
