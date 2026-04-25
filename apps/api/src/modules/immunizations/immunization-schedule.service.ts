/**
 * Immunization Schedule Service
 *
 * Defines recommended immunization schedules by age group and calculates
 * which vaccines are due or overdue for a given patient.
 *
 * Based on CDC ACIP recommended immunization schedules.
 * Reference: https://www.cdc.gov/vaccines/schedules/
 */

export interface ScheduleEntry {
  vaccineName: string;
  vaccineCode: string; // CVX code
  /** Minimum age in months when this dose is recommended */
  minAgeMonths: number;
  /** Maximum age in months — if exceeded, vaccine is overdue */
  maxAgeMonths: number;
  /** Dose number in the series */
  doseNumber: number;
  /** Total doses in the series */
  seriesTotal: number;
  /** Minimum interval in days since previous dose in the same series */
  minIntervalDays?: number;
  /** Category for grouping */
  category: 'infant' | 'child' | 'adolescent' | 'adult' | 'travel' | 'senior';
  /** Human-readable description */
  description: string;
}

/**
 * Recommended immunization schedule entries.
 * Ages are in months; 12 months = 1 year, 216 months = 18 years, etc.
 */
export const IMMUNIZATION_SCHEDULE: ScheduleEntry[] = [
  // ── Infant (0–12 months) ──────────────────────────────────────────────────
  {
    vaccineName: 'Hepatitis B',
    vaccineCode: '08',
    minAgeMonths: 0,
    maxAgeMonths: 2,
    doseNumber: 1,
    seriesTotal: 3,
    category: 'infant',
    description: 'Hepatitis B vaccine, dose 1 — at birth',
  },
  {
    vaccineName: 'Hepatitis B',
    vaccineCode: '08',
    minAgeMonths: 1,
    maxAgeMonths: 4,
    doseNumber: 2,
    seriesTotal: 3,
    minIntervalDays: 28,
    category: 'infant',
    description: 'Hepatitis B vaccine, dose 2 — 1–2 months',
  },
  {
    vaccineName: 'Hepatitis B',
    vaccineCode: '08',
    minAgeMonths: 6,
    maxAgeMonths: 18,
    doseNumber: 3,
    seriesTotal: 3,
    minIntervalDays: 56,
    category: 'infant',
    description: 'Hepatitis B vaccine, dose 3 — 6–18 months',
  },
  {
    vaccineName: 'DTaP',
    vaccineCode: '20',
    minAgeMonths: 2,
    maxAgeMonths: 4,
    doseNumber: 1,
    seriesTotal: 5,
    category: 'infant',
    description: 'DTaP (Diphtheria, Tetanus, Pertussis), dose 1 — 2 months',
  },
  {
    vaccineName: 'DTaP',
    vaccineCode: '20',
    minAgeMonths: 4,
    maxAgeMonths: 6,
    doseNumber: 2,
    seriesTotal: 5,
    minIntervalDays: 28,
    category: 'infant',
    description: 'DTaP, dose 2 — 4 months',
  },
  {
    vaccineName: 'DTaP',
    vaccineCode: '20',
    minAgeMonths: 6,
    maxAgeMonths: 8,
    doseNumber: 3,
    seriesTotal: 5,
    minIntervalDays: 28,
    category: 'infant',
    description: 'DTaP, dose 3 — 6 months',
  },
  {
    vaccineName: 'Hib',
    vaccineCode: '17',
    minAgeMonths: 2,
    maxAgeMonths: 4,
    doseNumber: 1,
    seriesTotal: 4,
    category: 'infant',
    description: 'Haemophilus influenzae type b (Hib), dose 1 — 2 months',
  },
  {
    vaccineName: 'Hib',
    vaccineCode: '17',
    minAgeMonths: 4,
    maxAgeMonths: 6,
    doseNumber: 2,
    seriesTotal: 4,
    minIntervalDays: 28,
    category: 'infant',
    description: 'Hib, dose 2 — 4 months',
  },
  {
    vaccineName: 'Hib',
    vaccineCode: '17',
    minAgeMonths: 6,
    maxAgeMonths: 8,
    doseNumber: 3,
    seriesTotal: 4,
    minIntervalDays: 28,
    category: 'infant',
    description: 'Hib, dose 3 — 6 months',
  },
  {
    vaccineName: 'IPV',
    vaccineCode: '10',
    minAgeMonths: 2,
    maxAgeMonths: 4,
    doseNumber: 1,
    seriesTotal: 4,
    category: 'infant',
    description: 'Inactivated Poliovirus (IPV), dose 1 — 2 months',
  },
  {
    vaccineName: 'IPV',
    vaccineCode: '10',
    minAgeMonths: 4,
    maxAgeMonths: 6,
    doseNumber: 2,
    seriesTotal: 4,
    minIntervalDays: 28,
    category: 'infant',
    description: 'IPV, dose 2 — 4 months',
  },
  {
    vaccineName: 'PCV13',
    vaccineCode: '133',
    minAgeMonths: 2,
    maxAgeMonths: 4,
    doseNumber: 1,
    seriesTotal: 4,
    category: 'infant',
    description: 'Pneumococcal conjugate (PCV13), dose 1 — 2 months',
  },
  {
    vaccineName: 'PCV13',
    vaccineCode: '133',
    minAgeMonths: 4,
    maxAgeMonths: 6,
    doseNumber: 2,
    seriesTotal: 4,
    minIntervalDays: 28,
    category: 'infant',
    description: 'PCV13, dose 2 — 4 months',
  },
  {
    vaccineName: 'PCV13',
    vaccineCode: '133',
    minAgeMonths: 6,
    maxAgeMonths: 8,
    doseNumber: 3,
    seriesTotal: 4,
    minIntervalDays: 28,
    category: 'infant',
    description: 'PCV13, dose 3 — 6 months',
  },
  {
    vaccineName: 'Rotavirus',
    vaccineCode: '122',
    minAgeMonths: 2,
    maxAgeMonths: 4,
    doseNumber: 1,
    seriesTotal: 3,
    category: 'infant',
    description: 'Rotavirus, dose 1 — 2 months',
  },
  {
    vaccineName: 'Rotavirus',
    vaccineCode: '122',
    minAgeMonths: 4,
    maxAgeMonths: 6,
    doseNumber: 2,
    seriesTotal: 3,
    minIntervalDays: 28,
    category: 'infant',
    description: 'Rotavirus, dose 2 — 4 months',
  },

  // ── Child (1–18 years) ────────────────────────────────────────────────────
  {
    vaccineName: 'MMR',
    vaccineCode: '03',
    minAgeMonths: 12,
    maxAgeMonths: 18,
    doseNumber: 1,
    seriesTotal: 2,
    category: 'child',
    description: 'MMR (Measles, Mumps, Rubella), dose 1 — 12–15 months',
  },
  {
    vaccineName: 'MMR',
    vaccineCode: '03',
    minAgeMonths: 48,
    maxAgeMonths: 72,
    doseNumber: 2,
    seriesTotal: 2,
    minIntervalDays: 28,
    category: 'child',
    description: 'MMR, dose 2 — 4–6 years',
  },
  {
    vaccineName: 'Varicella',
    vaccineCode: '21',
    minAgeMonths: 12,
    maxAgeMonths: 18,
    doseNumber: 1,
    seriesTotal: 2,
    category: 'child',
    description: 'Varicella (Chickenpox), dose 1 — 12–15 months',
  },
  {
    vaccineName: 'Varicella',
    vaccineCode: '21',
    minAgeMonths: 48,
    maxAgeMonths: 72,
    doseNumber: 2,
    seriesTotal: 2,
    minIntervalDays: 84,
    category: 'child',
    description: 'Varicella, dose 2 — 4–6 years',
  },
  {
    vaccineName: 'Hepatitis A',
    vaccineCode: '83',
    minAgeMonths: 12,
    maxAgeMonths: 24,
    doseNumber: 1,
    seriesTotal: 2,
    category: 'child',
    description: 'Hepatitis A, dose 1 — 12–23 months',
  },
  {
    vaccineName: 'Hepatitis A',
    vaccineCode: '83',
    minAgeMonths: 18,
    maxAgeMonths: 30,
    doseNumber: 2,
    seriesTotal: 2,
    minIntervalDays: 182,
    category: 'child',
    description: 'Hepatitis A, dose 2 — 6–18 months after dose 1',
  },
  {
    vaccineName: 'DTaP',
    vaccineCode: '20',
    minAgeMonths: 15,
    maxAgeMonths: 20,
    doseNumber: 4,
    seriesTotal: 5,
    minIntervalDays: 182,
    category: 'child',
    description: 'DTaP, dose 4 — 15–18 months',
  },
  {
    vaccineName: 'DTaP',
    vaccineCode: '20',
    minAgeMonths: 48,
    maxAgeMonths: 72,
    doseNumber: 5,
    seriesTotal: 5,
    minIntervalDays: 182,
    category: 'child',
    description: 'DTaP, dose 5 — 4–6 years',
  },
  {
    vaccineName: 'IPV',
    vaccineCode: '10',
    minAgeMonths: 6,
    maxAgeMonths: 18,
    doseNumber: 3,
    seriesTotal: 4,
    minIntervalDays: 28,
    category: 'child',
    description: 'IPV, dose 3 — 6–18 months',
  },
  {
    vaccineName: 'IPV',
    vaccineCode: '10',
    minAgeMonths: 48,
    maxAgeMonths: 72,
    doseNumber: 4,
    seriesTotal: 4,
    minIntervalDays: 182,
    category: 'child',
    description: 'IPV, dose 4 — 4–6 years',
  },
  {
    vaccineName: 'Hib',
    vaccineCode: '17',
    minAgeMonths: 12,
    maxAgeMonths: 18,
    doseNumber: 4,
    seriesTotal: 4,
    minIntervalDays: 56,
    category: 'child',
    description: 'Hib, dose 4 — 12–15 months',
  },
  {
    vaccineName: 'PCV13',
    vaccineCode: '133',
    minAgeMonths: 12,
    maxAgeMonths: 18,
    doseNumber: 4,
    seriesTotal: 4,
    minIntervalDays: 56,
    category: 'child',
    description: 'PCV13, dose 4 — 12–15 months',
  },
  {
    vaccineName: 'Influenza',
    vaccineCode: '88',
    minAgeMonths: 6,
    maxAgeMonths: 216,
    doseNumber: 1,
    seriesTotal: 1,
    category: 'child',
    description: 'Influenza (annual) — 6 months and older',
  },
  {
    vaccineName: 'HPV',
    vaccineCode: '165',
    minAgeMonths: 132,
    maxAgeMonths: 168,
    doseNumber: 1,
    seriesTotal: 2,
    category: 'adolescent',
    description: 'HPV9, dose 1 — 11–14 years',
  },
  {
    vaccineName: 'HPV',
    vaccineCode: '165',
    minAgeMonths: 138,
    maxAgeMonths: 216,
    doseNumber: 2,
    seriesTotal: 2,
    minIntervalDays: 182,
    category: 'adolescent',
    description: 'HPV9, dose 2 — 6–12 months after dose 1',
  },
  {
    vaccineName: 'Tdap',
    vaccineCode: '115',
    minAgeMonths: 132,
    maxAgeMonths: 156,
    doseNumber: 1,
    seriesTotal: 1,
    category: 'adolescent',
    description: 'Tdap booster — 11–13 years',
  },
  {
    vaccineName: 'Meningococcal MCV4',
    vaccineCode: '114',
    minAgeMonths: 132,
    maxAgeMonths: 156,
    doseNumber: 1,
    seriesTotal: 2,
    category: 'adolescent',
    description: 'Meningococcal conjugate (MCV4), dose 1 — 11–12 years',
  },
  {
    vaccineName: 'Meningococcal MCV4',
    vaccineCode: '114',
    minAgeMonths: 192,
    maxAgeMonths: 216,
    doseNumber: 2,
    seriesTotal: 2,
    minIntervalDays: 1460,
    category: 'adolescent',
    description: 'Meningococcal conjugate (MCV4), booster — 16 years',
  },

  // ── Adult (18+ years) ─────────────────────────────────────────────────────
  {
    vaccineName: 'Influenza',
    vaccineCode: '88',
    minAgeMonths: 216,
    maxAgeMonths: 99999,
    doseNumber: 1,
    seriesTotal: 1,
    category: 'adult',
    description: 'Influenza (annual) — adults',
  },
  {
    vaccineName: 'COVID-19',
    vaccineCode: '213',
    minAgeMonths: 6,
    maxAgeMonths: 99999,
    doseNumber: 1,
    seriesTotal: 1,
    category: 'adult',
    description: 'COVID-19 vaccine (updated formulation, annual)',
  },
  {
    vaccineName: 'Td',
    vaccineCode: '113',
    minAgeMonths: 216,
    maxAgeMonths: 99999,
    doseNumber: 1,
    seriesTotal: 1,
    category: 'adult',
    description: 'Td booster — every 10 years for adults',
  },
  {
    vaccineName: 'Zoster (Shingrix)',
    vaccineCode: '221',
    minAgeMonths: 600,
    maxAgeMonths: 99999,
    doseNumber: 1,
    seriesTotal: 2,
    category: 'senior',
    description: 'Zoster recombinant (Shingrix), dose 1 — 50+ years',
  },
  {
    vaccineName: 'Zoster (Shingrix)',
    vaccineCode: '221',
    minAgeMonths: 600,
    maxAgeMonths: 99999,
    doseNumber: 2,
    seriesTotal: 2,
    minIntervalDays: 56,
    category: 'senior',
    description: 'Zoster recombinant (Shingrix), dose 2 — 2–6 months after dose 1',
  },
  {
    vaccineName: 'Pneumococcal PCV20',
    vaccineCode: '177',
    minAgeMonths: 780,
    maxAgeMonths: 99999,
    doseNumber: 1,
    seriesTotal: 1,
    category: 'senior',
    description: 'Pneumococcal conjugate PCV20 — 65+ years',
  },
  {
    vaccineName: 'RSV',
    vaccineCode: '302',
    minAgeMonths: 720,
    maxAgeMonths: 99999,
    doseNumber: 1,
    seriesTotal: 1,
    category: 'senior',
    description: 'RSV vaccine — 60+ years',
  },

  // ── Travel vaccines ───────────────────────────────────────────────────────
  {
    vaccineName: 'Typhoid',
    vaccineCode: '101',
    minAgeMonths: 24,
    maxAgeMonths: 99999,
    doseNumber: 1,
    seriesTotal: 1,
    category: 'travel',
    description: 'Typhoid vaccine — for travel to endemic areas',
  },
  {
    vaccineName: 'Yellow Fever',
    vaccineCode: '184',
    minAgeMonths: 9,
    maxAgeMonths: 99999,
    doseNumber: 1,
    seriesTotal: 1,
    category: 'travel',
    description: 'Yellow Fever vaccine — for travel to endemic areas',
  },
  {
    vaccineName: 'Rabies',
    vaccineCode: '174',
    minAgeMonths: 0,
    maxAgeMonths: 99999,
    doseNumber: 1,
    seriesTotal: 3,
    category: 'travel',
    description: 'Rabies pre-exposure prophylaxis, dose 1',
  },
];

export interface DueVaccine {
  vaccineName: string;
  vaccineCode: string;
  doseNumber: number;
  seriesTotal: number;
  category: ScheduleEntry['category'];
  description: string;
  status: 'due' | 'overdue';
  /** Age in months when this dose became/becomes due */
  dueAtAgeMonths: number;
  /** Age in months when this dose becomes overdue */
  overdueAtAgeMonths: number;
}

/**
 * Calculate patient age in months from date of birth string (YYYY-MM-DD or ISO)
 */
export function ageInMonths(dateOfBirth: string): number {
  const dob = new Date(dateOfBirth);
  const now = new Date();
  const years = now.getFullYear() - dob.getFullYear();
  const months = now.getMonth() - dob.getMonth();
  return years * 12 + months;
}

/**
 * Calculate which vaccines are due or overdue for a patient.
 *
 * @param dateOfBirth - Patient's date of birth (ISO string or YYYY-MM-DD)
 * @param administeredVaccines - Array of { vaccineCode, doseNumber } already given
 * @returns Array of due/overdue vaccines
 */
export function calculateDueVaccines(
  dateOfBirth: string,
  administeredVaccines: Array<{ vaccineCode: string; doseNumber: number }>,
): DueVaccine[] {
  const patientAgeMonths = ageInMonths(dateOfBirth);

  // Build a set of already-administered vaccine+dose combinations
  const administered = new Set(
    administeredVaccines.map((v) => `${v.vaccineCode}:${v.doseNumber}`),
  );

  const dueVaccines: DueVaccine[] = [];

  for (const entry of IMMUNIZATION_SCHEDULE) {
    const key = `${entry.vaccineCode}:${entry.doseNumber}`;

    // Skip if already administered
    if (administered.has(key)) continue;

    // Skip travel vaccines — they are situational, not age-based
    if (entry.category === 'travel') continue;

    // Patient must be old enough for this dose
    if (patientAgeMonths < entry.minAgeMonths) continue;

    // Determine status
    const isOverdue = patientAgeMonths > entry.maxAgeMonths;

    dueVaccines.push({
      vaccineName: entry.vaccineName,
      vaccineCode: entry.vaccineCode,
      doseNumber: entry.doseNumber,
      seriesTotal: entry.seriesTotal,
      category: entry.category,
      description: entry.description,
      status: isOverdue ? 'overdue' : 'due',
      dueAtAgeMonths: entry.minAgeMonths,
      overdueAtAgeMonths: entry.maxAgeMonths,
    });
  }

  // Sort: overdue first, then by dueAtAgeMonths ascending
  return dueVaccines.sort((a, b) => {
    if (a.status === 'overdue' && b.status !== 'overdue') return -1;
    if (a.status !== 'overdue' && b.status === 'overdue') return 1;
    return a.dueAtAgeMonths - b.dueAtAgeMonths;
  });
}
