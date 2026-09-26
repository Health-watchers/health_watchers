/**
 * Provider scheduling — slot maths & optimizer unit tests (Issue #1248)
 */
import {
  generateFreeSlots,
  blockToSlots,
  resolveDayBlocks,
  overlaps,
  mergeIntervals,
} from '../slotting';
import { assignDemand, compactDay, type ProviderSlots } from '../schedule-optimizer';

const MON = '2026-09-07'; // a Monday (UTC)

describe('blockToSlots', () => {
  it('chops a block into fixed slots and never exceeds the block end', () => {
    const slots = blockToSlots(MON, { start: '09:00', end: '10:30' }, 30);
    expect(slots).toHaveLength(3);
    expect(slots[0].start.toISOString()).toBe('2026-09-07T09:00:00.000Z');
    expect(slots[2].end.toISOString()).toBe('2026-09-07T10:30:00.000Z');
  });

  it('honours a buffer between slots', () => {
    const slots = blockToSlots(MON, { start: '09:00', end: '11:00' }, 30, 15);
    // step = 45m -> 09:00, 09:45, 10:30 (10:30 + 30 = 11:00, still fits)
    expect(slots.map((s) => s.start.toISOString().slice(11, 16))).toEqual([
      '09:00',
      '09:45',
      '10:30',
    ]);
  });
});

describe('resolveDayBlocks', () => {
  const weekly = [{ dayOfWeek: 1, blocks: [{ start: '09:00', end: '12:00' }] }];

  it('uses the weekly pattern by default', () => {
    expect(resolveDayBlocks(new Date(`${MON}T00:00:00Z`), weekly)).toEqual([
      { start: '09:00', end: '12:00' },
    ]);
  });

  it('an "off" override clears the day', () => {
    const blocks = resolveDayBlocks(new Date(`${MON}T00:00:00Z`), weekly, [
      { date: MON, type: 'off' },
    ]);
    expect(blocks).toEqual([]);
  });

  it('a "custom" override replaces the day', () => {
    const blocks = resolveDayBlocks(new Date(`${MON}T00:00:00Z`), weekly, [
      { date: MON, type: 'custom', blocks: [{ start: '13:00', end: '15:00' }] },
    ]);
    expect(blocks).toEqual([{ start: '13:00', end: '15:00' }]);
  });
});

describe('generateFreeSlots — overbooking prevention', () => {
  const weeklyHours = [{ dayOfWeek: 1, blocks: [{ start: '09:00', end: '12:00' }] }];

  it('excludes slots that overlap an existing appointment', () => {
    const from = new Date(`${MON}T00:00:00Z`);
    const to = new Date(`${MON}T23:59:59Z`);
    const busy = [{ start: new Date(`${MON}T09:30:00Z`), end: new Date(`${MON}T10:00:00Z`) }];
    const slots = generateFreeSlots({ from, to, weeklyHours, slotMinutes: 30, busy });
    const starts = slots.map((s) => s.start.toISOString().slice(11, 16));
    expect(starts).toEqual(['09:00', '10:00', '10:30', '11:00', '11:30']);
    expect(starts).not.toContain('09:30');
  });

  it('caps at maxPerDay', () => {
    const from = new Date(`${MON}T00:00:00Z`);
    const to = new Date(`${MON}T23:59:59Z`);
    const slots = generateFreeSlots({
      from,
      to,
      weeklyHours,
      slotMinutes: 30,
      busy: [],
      maxPerDay: 2,
    });
    expect(slots).toHaveLength(2);
  });
});

describe('interval helpers', () => {
  it('overlaps is half-open', () => {
    const a = { start: new Date('2026-01-01T09:00Z'), end: new Date('2026-01-01T10:00Z') };
    const b = { start: new Date('2026-01-01T10:00Z'), end: new Date('2026-01-01T11:00Z') };
    expect(overlaps(a, b)).toBe(false);
    expect(overlaps(a, { ...b, start: new Date('2026-01-01T09:59Z') })).toBe(true);
  });

  it('mergeIntervals collapses overlaps', () => {
    const merged = mergeIntervals([
      { start: new Date('2026-01-01T09:00Z'), end: new Date('2026-01-01T10:00Z') },
      { start: new Date('2026-01-01T09:30Z'), end: new Date('2026-01-01T11:00Z') },
      { start: new Date('2026-01-01T12:00Z'), end: new Date('2026-01-01T13:00Z') },
    ]);
    expect(merged).toHaveLength(2);
    expect(merged[0].end.toISOString()).toBe('2026-01-01T11:00:00.000Z');
  });
});

describe('assignDemand — load balancing & wait minimisation', () => {
  function slots(day: string, times: string[]): ProviderSlots['slots'] {
    return times.map((t) => ({
      start: new Date(`${day}T${t}:00Z`),
      end: new Date(`${day}T${t}:00Z`),
      available: true,
    }));
  }

  it('spreads demand across providers by lowest load then earliest slot', () => {
    const providerSlots: ProviderSlots[] = [
      { providerId: 'p1', slots: slots(MON, ['09:00', '09:30', '10:00']) },
      { providerId: 'p2', slots: slots(MON, ['09:15', '09:45']) },
    ];
    const result = assignDemand(4, providerSlots, new Date(`${MON}T09:00:00Z`));
    expect(result.unassigned).toBe(0);
    expect(result.perProviderLoad).toEqual({ p1: 2, p2: 2 });
    expect(result.assignments).toHaveLength(4);
  });

  it('reports unassigned when capacity is short', () => {
    const providerSlots: ProviderSlots[] = [{ providerId: 'p1', slots: slots(MON, ['09:00']) }];
    const result = assignDemand(3, providerSlots, new Date(`${MON}T09:00:00Z`));
    expect(result.unassigned).toBe(2);
  });
});

describe('compactDay', () => {
  it('pulls an appointment forward into an earlier free slot and reports savings', () => {
    const booked = [{ start: new Date(`${MON}T11:00:00Z`), end: new Date(`${MON}T11:30:00Z`) }];
    const free = [
      { start: new Date(`${MON}T09:00:00Z`), end: new Date(`${MON}T09:30:00Z`), available: true },
    ];
    const { moves, totalSavedMinutes } = compactDay(booked, free);
    expect(moves).toHaveLength(1);
    expect(totalSavedMinutes).toBe(120);
  });
});
