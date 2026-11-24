/**
 * Schedule optimization — Issue #1248
 *
 * Two pure routines:
 *   - `assignDemand`   : spread N appointment requests across providers' free
 *                        slots choosing, at each step, the earliest slot from
 *                        the least-loaded provider. Minimises the maximum wait
 *                        and keeps provider load balanced.
 *   - `compactDay`     : given a day's booked appointments and the free slots
 *                        that existed, propose pull-forward moves that shrink
 *                        idle gaps, and report the wait-time saved.
 */
import type { Interval, Slot } from './slotting';

export interface ProviderSlots {
  providerId: string;
  slots: Slot[]; // assumed sorted ascending by start
}

export interface Assignment {
  providerId: string;
  slotStart: Date;
  slotEnd: Date;
  /** minutes from `referenceTime` to the assigned slot start */
  waitMinutes: number;
}

export interface OptimizeResult {
  assignments: Assignment[];
  unassigned: number;
  avgWaitMinutes: number;
  maxWaitMinutes: number;
  perProviderLoad: Record<string, number>;
}

/**
 * @param demand         number of appointments to place
 * @param providerSlots  each provider's currently-free slots
 * @param referenceTime  "now" — waits are measured from here
 */
export function assignDemand(
  demand: number,
  providerSlots: ProviderSlots[],
  referenceTime: Date = new Date()
): OptimizeResult {
  // Work on shallow copies of the queues so callers keep their arrays intact.
  const queues = providerSlots.map((p) => ({
    providerId: p.providerId,
    slots: [...p.slots]
      .filter((s) => s.available)
      .sort((a, b) => a.start.getTime() - b.start.getTime()),
    load: 0,
  }));

  const assignments: Assignment[] = [];
  let unassigned = 0;

  for (let i = 0; i < demand; i++) {
    // Candidate = provider with capacity, preferring lowest load then earliest slot.
    let best: (typeof queues)[number] | null = null;
    for (const q of queues) {
      if (q.slots.length === 0) continue;
      if (
        best === null ||
        q.load < best.load ||
        (q.load === best.load && q.slots[0].start < best.slots[0].start)
      ) {
        best = q;
      }
    }
    if (!best) {
      unassigned = demand - i;
      break;
    }
    const slot = best.slots.shift()!;
    best.load += 1;
    assignments.push({
      providerId: best.providerId,
      slotStart: slot.start,
      slotEnd: slot.end,
      waitMinutes: Math.max(
        0,
        Math.round((slot.start.getTime() - referenceTime.getTime()) / 60_000)
      ),
    });
  }

  const waits = assignments.map((a) => a.waitMinutes);
  return {
    assignments,
    unassigned,
    avgWaitMinutes: waits.length ? Math.round(waits.reduce((s, w) => s + w, 0) / waits.length) : 0,
    maxWaitMinutes: waits.length ? Math.max(...waits) : 0,
    perProviderLoad: Object.fromEntries(queues.map((q) => [q.providerId, q.load])),
  };
}

export interface CompactionMove {
  from: Date;
  to: Date;
  savedMinutes: number;
}

/**
 * Propose pulling appointments forward into earlier free slots to remove gaps.
 * `booked` and `free` are same-day intervals; returns the moves and total wait
 * saved. Non-destructive — the caller decides whether to apply.
 */
export function compactDay(
  booked: Interval[],
  free: Slot[]
): {
  moves: CompactionMove[];
  totalSavedMinutes: number;
} {
  const sortedBooked = [...booked].sort((a, b) => a.start.getTime() - b.start.getTime());
  const openSlots = [...free]
    .filter((s) => s.available)
    .sort((a, b) => a.start.getTime() - b.start.getTime());

  const moves: CompactionMove[] = [];
  let totalSavedMinutes = 0;

  for (const appt of sortedBooked) {
    const durationMs = appt.end.getTime() - appt.start.getTime();
    // earliest free slot that starts before this appointment and fits it
    const idx = openSlots.findIndex(
      (s) => s.start < appt.start && s.end.getTime() - s.start.getTime() >= durationMs
    );
    if (idx === -1) continue;
    const target = openSlots.splice(idx, 1)[0];
    const saved = Math.round((appt.start.getTime() - target.start.getTime()) / 60_000);
    if (saved <= 0) continue;
    moves.push({ from: appt.start, to: target.start, savedMinutes: saved });
    totalSavedMinutes += saved;
  }

  return { moves, totalSavedMinutes };
}
