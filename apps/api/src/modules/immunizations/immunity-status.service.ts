/**
 * Immunity status calculation (Issue #1246)
 *
 * Computes a per-vaccine immunity status for a patient from their recorded
 * doses against the CDC schedule:
 *
 *  - immune        — all recommended doses in the series administered (and any
 *                    recurring booster is still within its window)
 *  - due           — the next dose in the series is due now
 *  - overdue       — the next dose should have been given already
 *  - not_started   — the patient is old enough to start the series but has
 *                    received no doses
 *  - not_eligible  — the patient is below the minimum age for the series
 *  - unknown       — no schedule entry for the vaccine
 *
 * Pure and unit-tested.
 */
import { IMMUNIZATION_SCHEDULE, ScheduleEntry } from './immunization-schedule.service';

export type ImmunityStatus =
  | 'immune'
  | 'due'
  | 'overdue'
  | 'not_started'
  | 'not_eligible'
  | 'unknown';

export interface VaccineImmunityStatus {
  vaccineCode: string;
  vaccineName: string;
  status: ImmunityStatus;
  dosesReceived: number;
  seriesTotal: number;
  seriesComplete: boolean;
  lastAdministeredDate?: Date;
  nextDueDate?: Date;
  /** Boosters that repeat on a cadence (annual flu, 10-year Td). */
  boosterWindowDays?: number;
}

export interface AdministeredDose {
  vaccineCode: string;
  doseNumber: number;
  administeredDate: Date;
}

const ANNUAL_BOOSTERS = new Set(['Influenza']);
const DECENNIAL_BOOSTERS = new Set(['Td']);

export function ageInMonthsAt(dateOfBirth: string, atDate: Date): number {
  const dob = new Date(dateOfBirth);
  const years = atDate.getFullYear() - dob.getFullYear();
  const months = atDate.getMonth() - dob.getMonth();
  const days = atDate.getDate() - dob.getDate();
  let total = years * 12 + months;
  if (days < 0) total -= 1;
  return Math.max(0, total);
}

function addMonths(dateOfBirth: string, months: number): Date {
  const date = new Date(dateOfBirth);
  date.setMonth(date.getMonth() + months);
  return date;
}

function boosterWindowDays(vaccineName: string): number | undefined {
  if (ANNUAL_BOOSTERS.has(vaccineName)) return 365;
  if (DECENNIAL_BOOSTERS.has(vaccineName)) return 3650;
  return undefined;
}

/**
 * Compute immunity status for every vaccine in the schedule for a patient.
 */
export function calculateImmunityStatus(
  dateOfBirth: string,
  administered: AdministeredDose[],
  schedule: ScheduleEntry[] = IMMUNIZATION_SCHEDULE,
  asOf: Date = new Date()
): VaccineImmunityStatus[] {
  const ageMonths = ageInMonthsAt(dateOfBirth, asOf);

  // Group schedule entries by vaccine (name + code).
  const seriesByVaccine = new Map<string, ScheduleEntry[]>();
  for (const entry of schedule) {
    if (entry.category === 'travel') continue;
    const key = entry.vaccineCode;
    const list = seriesByVaccine.get(key) ?? [];
    list.push(entry);
    seriesByVaccine.set(key, list);
  }

  const dosesByVaccine = new Map<string, AdministeredDose[]>();
  for (const dose of administered) {
    const list = dosesByVaccine.get(dose.vaccineCode) ?? [];
    list.push(dose);
    dosesByVaccine.set(dose.vaccineCode, list);
  }

  const results: VaccineImmunityStatus[] = [];

  for (const [vaccineCode, entries] of seriesByVaccine) {
    const first = entries.reduce((a, b) => (a.minAgeMonths < b.minAgeMonths ? a : b));
    const seriesTotal = Math.max(...entries.map((e) => e.seriesTotal));
    const doses = (dosesByVaccine.get(vaccineCode) ?? []).sort(
      (a, b) => a.administeredDate.getTime() - b.administeredDate.getTime()
    );
    const dosesReceived = doses.length;
    const last = doses[doses.length - 1];
    const seriesComplete = dosesReceived >= seriesTotal;
    const windowDays = boosterWindowDays(first.vaccineName);

    const base: VaccineImmunityStatus = {
      vaccineCode,
      vaccineName: first.vaccineName,
      status: 'unknown',
      dosesReceived,
      seriesTotal,
      seriesComplete,
      lastAdministeredDate: last?.administeredDate,
      boosterWindowDays: windowDays,
    };

    // Below the minimum age for the series
    if (ageMonths < first.minAgeMonths) {
      results.push({
        ...base,
        status: 'not_eligible',
        nextDueDate: addMonths(dateOfBirth, first.minAgeMonths),
      });
      continue;
    }

    // For adolescent-only series (HPV, Tdap, MCV4), once the entire recommended
    // window has passed and the series was never started (e.g. HPV for adults),
    // the vaccine is no longer routinely recommended — it should not count as
    // due or overdue. Childhood vaccines remain catch-up eligible, so this only
    // applies when every bounded schedule entry is adolescent-category.
    if (dosesReceived === 0) {
      const bounded = entries.filter((e) => e.maxAgeMonths < 99999);
      const allAdolescent = bounded.length > 0 && bounded.every((e) => e.category === 'adolescent');
      if (allAdolescent) {
        const boundedMax = Math.max(...bounded.map((e) => e.maxAgeMonths));
        if (ageMonths > boundedMax) {
          results.push({ ...base, status: 'unknown' });
          continue;
        }
      }
    }

    // Series complete — check booster windows for recurring vaccines
    if (seriesComplete) {
      if (last && windowDays) {
        const daysSince = Math.floor(
          (asOf.getTime() - last.administeredDate.getTime()) / (1000 * 60 * 60 * 24)
        );
        const status: ImmunityStatus = daysSince > windowDays ? 'due' : 'immune';
        results.push({
          ...base,
          status,
          nextDueDate: new Date(last.administeredDate.getTime() + windowDays * 24 * 60 * 60 * 1000),
        });
      } else {
        results.push({ ...base, status: 'immune' });
      }
      continue;
    }

    // Find the next dose that has not been given yet
    const nextEntry = entries
      .filter((e) => !doses.some((d) => d.doseNumber === e.doseNumber))
      .sort((a, b) => a.doseNumber - b.doseNumber)[0];

    if (!nextEntry) {
      results.push({ ...base, status: 'unknown' });
      continue;
    }

    const nextDueDate = addMonths(dateOfBirth, nextEntry.minAgeMonths);

    if (dosesReceived === 0 && ageMonths >= first.minAgeMonths) {
      results.push({ ...base, status: 'not_started', nextDueDate });
      continue;
    }

    if (ageMonths < nextEntry.minAgeMonths) {
      results.push({ ...base, status: 'not_eligible', nextDueDate });
      continue;
    }

    const isOverdue = nextEntry.maxAgeMonths < 99999 && ageMonths > nextEntry.maxAgeMonths;
    results.push({
      ...base,
      status: isOverdue ? 'overdue' : 'due',
      nextDueDate,
    });
  }

  return results.sort((a, b) => a.vaccineName.localeCompare(b.vaccineName));
}
