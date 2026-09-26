/**
 * Vaccine conflict detection (Issue #1246)
 *
 * Detects scheduling, dosing, and lot-level conflicts before a dose is
 * administered:
 *
 *  - too-early age (below the CDC minimum age for the dose)
 *  - past maximum age (e.g. Rotavirus after 8 months)
 *  - insufficient interval since the previous dose in the same series
 *  - duplicate dose (same vaccine + dose number already recorded)
 *  - dose beyond the series total
 *  - unknown / expired / recalled / depleted lot
 *
 * Schedule rules come from IMMUNIZATION_SCHEDULE; lot rules come from the
 * VaccineLot collection. Pure functions are unit-tested.
 */
import { IMMUNIZATION_SCHEDULE, ScheduleEntry } from './immunization-schedule.service';
import { VaccineLotModel } from './vaccine-lot.model';

export type ConflictSeverity = 'info' | 'warning' | 'critical';

export interface VaccineConflict {
  vaccineCode: string;
  vaccineName: string;
  doseNumber: number;
  type:
    | 'too_early_age'
    | 'past_max_age'
    | 'insufficient_interval'
    | 'duplicate_dose'
    | 'series_complete'
    | 'unknown_lot'
    | 'expired_lot'
    | 'recalled_lot'
    | 'depleted_lot';
  severity: ConflictSeverity;
  message: string;
  detail?: Record<string, unknown>;
}

/** Patient age in months at a specific date. */
export function ageInMonthsAt(dateOfBirth: string, atDate: Date): number {
  const dob = new Date(dateOfBirth);
  const years = atDate.getFullYear() - dob.getFullYear();
  const months = atDate.getMonth() - dob.getMonth();
  const days = atDate.getDate() - dob.getDate();
  let total = years * 12 + months;
  if (days < 0) total -= 1;
  return Math.max(0, total);
}

export interface PreviousDose {
  vaccineCode: string;
  doseNumber: number;
  administeredDate: Date;
}

export interface DetectConflictsInput {
  dateOfBirth: string;
  vaccineCode: string;
  doseNumber: number;
  administeredDate: Date;
  previousDoses: PreviousDose[];
  schedule?: ScheduleEntry[];
}

/**
 * Detect schedule-based conflicts for a prospective dose. Purely functional —
 * no database access.
 */
export function detectScheduleConflicts(input: DetectConflictsInput): VaccineConflict[] {
  const {
    dateOfBirth,
    vaccineCode,
    doseNumber,
    administeredDate,
    previousDoses,
    schedule = IMMUNIZATION_SCHEDULE,
  } = input;

  const conflicts: VaccineConflict[] = [];

  const vaccineEntries = schedule.filter((e) => e.vaccineCode === vaccineCode);
  if (vaccineEntries.length === 0) return conflicts;

  const entry = vaccineEntries.find((e) => e.doseNumber === doseNumber) ?? vaccineEntries[0];
  const seriesTotal = Math.max(...vaccineEntries.map((e) => e.seriesTotal));
  const ageMonths = ageInMonthsAt(dateOfBirth, administeredDate);

  // Too early — below the CDC minimum age for this dose
  if (ageMonths < entry.minAgeMonths) {
    conflicts.push({
      vaccineCode,
      vaccineName: entry.vaccineName,
      doseNumber,
      type: 'too_early_age',
      severity: 'critical',
      message: `${entry.vaccineName} dose ${doseNumber} is due at ${entry.minAgeMonths} months; patient is only ${ageMonths} months old`,
      detail: { ageMonths, minAgeMonths: entry.minAgeMonths },
    });
  }

  // Past the maximum age for this dose (e.g. Rotavirus has a hard max)
  if (entry.maxAgeMonths < 99999 && ageMonths > entry.maxAgeMonths) {
    conflicts.push({
      vaccineCode,
      vaccineName: entry.vaccineName,
      doseNumber,
      type: 'past_max_age',
      severity: 'warning',
      message: `${entry.vaccineName} dose ${doseNumber} should be given by ${entry.maxAgeMonths} months`,
      detail: { ageMonths, maxAgeMonths: entry.maxAgeMonths },
    });
  }

  // Duplicate dose — same vaccine and dose number already recorded
  const alreadyGiven = previousDoses.some(
    (d) => d.vaccineCode === vaccineCode && d.doseNumber === doseNumber
  );
  if (alreadyGiven) {
    conflicts.push({
      vaccineCode,
      vaccineName: entry.vaccineName,
      doseNumber,
      type: 'duplicate_dose',
      severity: 'critical',
      message: `${entry.vaccineName} dose ${doseNumber} has already been administered`,
    });
  }

  // Dose beyond series total
  if (doseNumber > seriesTotal) {
    conflicts.push({
      vaccineCode,
      vaccineName: entry.vaccineName,
      doseNumber,
      type: 'series_complete',
      severity: 'info',
      message: `${entry.vaccineName} series is complete after ${seriesTotal} doses`,
      detail: { seriesTotal },
    });
  }

  // Insufficient interval since the previous dose in the same series
  if (entry.minIntervalDays && doseNumber > 1) {
    const previous = previousDoses
      .filter((d) => d.vaccineCode === vaccineCode && d.doseNumber === doseNumber - 1)
      .sort((a, b) => b.administeredDate.getTime() - a.administeredDate.getTime())[0];

    if (previous) {
      const intervalDays = Math.floor(
        (administeredDate.getTime() - previous.administeredDate.getTime()) / (1000 * 60 * 60 * 24)
      );
      if (intervalDays < entry.minIntervalDays) {
        conflicts.push({
          vaccineCode,
          vaccineName: entry.vaccineName,
          doseNumber,
          type: 'insufficient_interval',
          severity: 'warning',
          message: `Minimum interval of ${entry.minIntervalDays} days since previous dose not met (${intervalDays} days)`,
          detail: { intervalDays, minIntervalDays: entry.minIntervalDays },
        });
      }
    }
  }

  return conflicts;
}

/** Lot-level conflicts for a prospective dose. Async — consults VaccineLot. */
export async function detectLotConflicts(
  clinicId: string,
  lotNumber: string
): Promise<VaccineConflict[]> {
  const conflicts: VaccineConflict[] = [];

  const lot = await VaccineLotModel.findOne({ clinicId, lotNumber }).lean();
  if (!lot) {
    conflicts.push({
      vaccineCode: '',
      vaccineName: 'Unknown vaccine',
      doseNumber: 0,
      type: 'unknown_lot',
      severity: 'warning',
      message: `Lot ${lotNumber} is not tracked in inventory — record it before administering`,
      detail: { lotNumber },
    });
    return conflicts;
  }

  const base = {
    vaccineCode: lot.vaccineCode,
    vaccineName: lot.vaccineName,
    doseNumber: 0,
    detail: { lotNumber },
  };

  if (lot.status === 'recalled') {
    conflicts.push({
      ...base,
      type: 'recalled_lot',
      severity: 'critical',
      message: `Lot ${lotNumber} (${lot.vaccineName}) is recalled: ${lot.recalledReason ?? 'no reason given'}`,
    });
  }

  if (lot.expiryDate && lot.expiryDate < new Date()) {
    conflicts.push({
      ...base,
      type: 'expired_lot',
      severity: 'critical',
      message: `Lot ${lotNumber} expired on ${lot.expiryDate.toISOString().slice(0, 10)}`,
    });
  }

  const remaining = lot.quantityReceived - lot.quantityAdministered - lot.quantityWasted;
  if (remaining <= 0) {
    conflicts.push({
      ...base,
      type: 'depleted_lot',
      severity: 'warning',
      message: `Lot ${lotNumber} has no remaining doses`,
      detail: { quantityRemaining: Math.max(remaining, 0) },
    });
  }

  return conflicts;
}

/** Combined schedule + lot conflict detection for a prospective dose. */
export async function detectVaccineConflicts(
  input: DetectConflictsInput & { clinicId: string; lotNumber?: string }
): Promise<VaccineConflict[]> {
  const conflicts = detectScheduleConflicts(input);

  if (input.lotNumber) {
    const lotConflicts = await detectLotConflicts(input.clinicId, input.lotNumber);
    conflicts.push(...lotConflicts);
  }

  return conflicts;
}
