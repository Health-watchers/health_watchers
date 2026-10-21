import type { AdherenceCategory, AdherenceDose, AdherenceSummary, MedicationFrequency } from './types';

/** Number of scheduled doses per day for each frequency. */
export const DOSES_PER_DAY: Record<MedicationFrequency, number> = {
  once_daily: 1,
  twice_daily: 2,
  three_times_daily: 3,
  four_times_daily: 4,
  every_other_day: 1,
  weekly: 1,
  as_needed: 0,
};

export function dosesPerDay(frequency: MedicationFrequency): number {
  return DOSES_PER_DAY[frequency];
}

export function adherenceCategory(rate: number): AdherenceCategory {
  if (rate >= 95) return 'excellent';
  if (rate >= 85) return 'good';
  if (rate >= 70) return 'fair';
  return 'poor';
}

/**
 * Aggregates per-day dose data into an adherence summary.
 *
 * `rate` is the percentage of scheduled doses that were taken. When nothing was
 * scheduled (e.g. an as-needed medication) the rate is reported as 100 so the
 * patient is not flagged for doses that were never due.
 */
export function computeAdherence(doses: readonly AdherenceDose[]): AdherenceSummary {
  let scheduled = 0;
  let taken = 0;

  for (const dose of doses) {
    scheduled += dose.scheduled;
    taken += Math.min(dose.taken, dose.scheduled);
  }

  const missed = Math.max(scheduled - taken, 0);
  const rate = scheduled === 0 ? 100 : Math.round((taken / scheduled) * 100);

  return { scheduled, taken, missed, rate, category: adherenceCategory(rate) };
}

function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) % 2147483647;
  }
  return hash;
}

/**
 * Deterministic pseudo-random ratio in [0, 1) derived from a seed string.
 * Deterministic output keeps demo data (and unit tests) stable across renders.
 */
function deterministicRatio(seed: string): number {
  return (hashString(seed) % 1000) / 1000;
}

function isoDateOffset(endDate: Date, daysAgo: number): string {
  return new Date(endDate.getTime() - daysAgo * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/**
 * Builds a reproducible adherence series for the trailing `days` window.
 * Biased towards adherence (~88%) so the demo shows realistic variation.
 */
export function generateAdherenceDoses(
  medicationId: string,
  frequency: MedicationFrequency,
  days = 14,
  endDate: Date = new Date()
): AdherenceDose[] {
  const perDay = dosesPerDay(frequency);
  const series: AdherenceDose[] = [];

  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const date = isoDateOffset(endDate, offset);
    const dueToday = frequency === 'every_other_day' && offset % 2 === 1 ? 0 : perDay;
    const ratio = deterministicRatio(`${medicationId}:${date}`);
    const taken = dueToday > 0 && ratio > 0.88 ? dueToday - 1 : dueToday;
    series.push({ date, scheduled: dueToday, taken });
  }

  return series;
}
