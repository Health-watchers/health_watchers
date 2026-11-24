/**
 * Pure, dependency-free slot maths for the provider scheduling system.
 * Issue #1248
 *
 * Times inside a day are "HH:mm" wall-clock strings; a slot on the wire is an
 * absolute {start, end} Date pair. Keeping this module pure makes the
 * overbooking / conflict rules straightforward to unit-test.
 */
import type {
  TimeBlock,
  DayHours,
  AvailabilityOverride,
} from './models/provider-availability.model';

export interface Interval {
  start: Date;
  end: Date;
}

export interface Slot extends Interval {
  available: boolean;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

/** "YYYY-MM-DD" for a Date, in UTC. */
export function dateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Combine a UTC day with an "HH:mm" wall-clock time. */
export function atTime(dayKey: string, hhmm: string): Date {
  return new Date(`${dayKey}T${hhmm.padStart(5, '0')}:00.000Z`);
}

export function overlaps(a: Interval, b: Interval): boolean {
  return a.start < b.end && b.start < a.end;
}

/** Merge overlapping / touching intervals into a minimal disjoint set. */
export function mergeIntervals(intervals: Interval[]): Interval[] {
  if (intervals.length === 0) return [];
  const sorted = [...intervals].sort((x, y) => x.start.getTime() - y.start.getTime());
  const out: Interval[] = [];
  for (const iv of sorted) {
    const last = out.length > 0 ? out[out.length - 1] : undefined;
    if (last && iv.start <= last.end) {
      if (iv.end > last.end) last.end = iv.end;
    } else {
      out.push({ ...iv });
    }
  }
  return out;
}

/**
 * Resolve the working blocks for a specific day: an override wins over the
 * recurring weekly pattern; an "off" override yields no blocks.
 */
export function resolveDayBlocks(
  day: Date,
  weeklyHours: DayHours[],
  overrides: AvailabilityOverride[] = []
): TimeBlock[] {
  const key = dateKey(day);
  const override = overrides.find((o) => o.date === key);
  if (override) {
    if (override.type === 'off') return [];
    return override.blocks ?? [];
  }
  const dow = day.getUTCDay();
  return weeklyHours.find((w) => w.dayOfWeek === dow)?.blocks ?? [];
}

/** Chop a working block into fixed-length candidate slots (+ optional buffer). */
export function blockToSlots(
  dayKey: string,
  block: TimeBlock,
  slotMinutes: number,
  bufferMinutes = 0
): Interval[] {
  const step = slotMinutes + bufferMinutes;
  const startMin = toMinutes(block.start);
  const endMin = toMinutes(block.end);
  const slots: Interval[] = [];
  for (let m = startMin; m + slotMinutes <= endMin; m += step) {
    const h = Math.floor(m / 60);
    const min = m % 60;
    const startStr = `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
    const start = atTime(dayKey, startStr);
    slots.push({ start, end: new Date(start.getTime() + slotMinutes * 60_000) });
  }
  return slots;
}

/**
 * Generate free slots across [from, to) for one provider given their resolved
 * blocks and the set of busy intervals (appointments + approved time-off).
 * A candidate slot overlapping ANY busy interval is dropped — this is what
 * prevents overbooking.
 */
export function generateFreeSlots(params: {
  from: Date;
  to: Date;
  weeklyHours: DayHours[];
  overrides?: AvailabilityOverride[];
  slotMinutes: number;
  bufferMinutes?: number;
  busy: Interval[];
  maxPerDay?: number;
}): Slot[] {
  const { from, to, weeklyHours, overrides = [], slotMinutes, bufferMinutes = 0, busy } = params;
  const busyMerged = mergeIntervals(busy);
  const out: Slot[] = [];

  const startDay = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()));
  for (let t = startDay.getTime(); t < to.getTime(); t += DAY_MS) {
    const day = new Date(t);
    const key = dateKey(day);
    const blocks = resolveDayBlocks(day, weeklyHours, overrides);
    let bookedToday = 0;

    for (const block of blocks) {
      for (const cand of blockToSlots(key, block, slotMinutes, bufferMinutes)) {
        if (cand.start < from || cand.end > to) continue;
        const clash = busyMerged.some((b) => overlaps(cand, b));
        const available = !clash && (params.maxPerDay == null || bookedToday < params.maxPerDay);
        if (clash) continue;
        if (params.maxPerDay != null && bookedToday >= params.maxPerDay) continue;
        out.push({ ...cand, available });
        bookedToday += 1;
      }
    }
  }
  return out;
}
