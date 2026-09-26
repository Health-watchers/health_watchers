/**
 * Client-side helpers for the staff schedule page.
 * Shapes mirror apps/api/src/modules/schedules/models/staff-schedule.model.ts.
 */

export type RecurrenceType = 'none' | 'daily' | 'weekly' | 'biweekly' | 'monthly';

export interface StaffSchedule {
  _id: string;
  userId: string;
  date?: string;
  dayOfWeek?: number;
  startTime: string; // HH:mm
  endTime: string; // HH:mm
  isAvailable: boolean;
  recurrence: RecurrenceType;
  recurrenceEndDate?: string;
  notes?: string;
  createdAt?: string;
}

export interface ShiftOccurrence {
  /** Unique per occurrence: `${scheduleId}:${dateKey}` */
  key: string;
  schedule: StaffSchedule;
  dateKey: string; // YYYY-MM-DD
  startTime: string;
  endTime: string;
}

export const SLOT_MINUTES = 30;
export const SLOTS_PER_DAY = (24 * 60) / SLOT_MINUTES;
/** The API only accepts HH:mm up to 23:59, so a shift running "to midnight" ends here. */
export const END_OF_DAY = '23:59';

// ── Time & date primitives ──────────────────────────────────────────────────

export function toMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

export function fromMinutes(total: number): string {
  if (total >= 24 * 60) return END_OF_DAY;
  const clamped = Math.max(0, total);
  const h = Math.floor(clamped / 60);
  const m = clamped % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function slotToTime(slot: number): string {
  return fromMinutes(slot * SLOT_MINUTES);
}

/** Local calendar date as YYYY-MM-DD. */
export function dateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Parses YYYY-MM-DD as a local date (not UTC). */
export function fromDateKey(key: string): Date {
  const [y, m, d] = key.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

export function startOfWeek(date: Date): Date {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  return addDays(d, -d.getDay());
}

export function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

/** Days shown for a view — a week, or the full weeks covering a month. */
export function visibleDays(view: 'week' | 'month', anchor: Date): Date[] {
  if (view === 'week') {
    const start = startOfWeek(anchor);
    return Array.from({ length: 7 }, (_, i) => addDays(start, i));
  }
  const first = startOfMonth(anchor);
  const start = startOfWeek(first);
  const last = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0);
  const end = addDays(startOfWeek(last), 6);
  const days: Date[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) days.push(d);
  return days;
}

// ── Recurrence expansion ────────────────────────────────────────────────────

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

function occursOn(schedule: StaffSchedule, day: Date): boolean {
  const key = dateKey(day);

  if (schedule.recurrence === 'none' || schedule.dayOfWeek === undefined) {
    // Dates are stored at UTC midnight, so compare the calendar part only
    return Boolean(schedule.date) && schedule.date!.slice(0, 10) === key;
  }

  if (schedule.recurrenceEndDate && key > schedule.recurrenceEndDate.slice(0, 10)) return false;
  if (schedule.recurrence === 'daily') return true;
  if (day.getDay() !== schedule.dayOfWeek) return false;

  if (schedule.recurrence === 'biweekly') {
    const anchor = startOfWeek(schedule.createdAt ? new Date(schedule.createdAt) : day);
    const weeks = Math.round((startOfWeek(day).getTime() - anchor.getTime()) / WEEK_MS);
    return weeks % 2 === 0;
  }
  if (schedule.recurrence === 'monthly') {
    // First matching weekday of each month
    return day.getDate() <= 7;
  }
  return true; // weekly
}

export function expandOccurrences(schedules: StaffSchedule[], days: Date[]): ShiftOccurrence[] {
  const out: ShiftOccurrence[] = [];
  for (const day of days) {
    const key = dateKey(day);
    for (const schedule of schedules) {
      if (!occursOn(schedule, day)) continue;
      out.push({
        key: `${schedule._id}:${key}`,
        schedule,
        dateKey: key,
        startTime: schedule.startTime,
        endTime: schedule.endTime,
      });
    }
  }
  return out.sort((a, b) =>
    a.dateKey === b.dateKey
      ? a.startTime.localeCompare(b.startTime)
      : a.dateKey.localeCompare(b.dateKey)
  );
}

// ── Conflicts ───────────────────────────────────────────────────────────────

/** Same rule as staff-availability.service.ts: HH:mm ranges overlap when startA < endB && endA > startB. */
export function overlaps(startA: string, endA: string, startB: string, endB: string): boolean {
  return startA < endB && endA > startB;
}

export interface ShiftCandidate {
  scheduleId?: string;
  userId: string;
  dateKey: string;
  startTime: string;
  endTime: string;
  /** When set, the candidate repeats weekly on this weekday. */
  dayOfWeek?: number;
}

/**
 * Returns loaded occurrences that would overlap the candidate for the same staff member.
 * Recurring candidates are checked against every loaded occurrence on the same weekday.
 */
export function findConflicts(
  candidate: ShiftCandidate,
  occurrences: ShiftOccurrence[]
): ShiftOccurrence[] {
  return occurrences.filter((o) => {
    if (o.schedule._id === candidate.scheduleId) return false;
    if (o.schedule.userId !== candidate.userId) return false;
    const sameDay =
      candidate.dayOfWeek !== undefined
        ? fromDateKey(o.dateKey).getDay() === candidate.dayOfWeek
        : o.dateKey === candidate.dateKey;
    return sameDay && overlaps(candidate.startTime, candidate.endTime, o.startTime, o.endTime);
  });
}
