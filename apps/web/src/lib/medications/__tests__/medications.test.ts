import { DRUG_INTERACTIONS, getInteraction, searchDrugs } from '@/lib/medications/catalog';
import {
  checkInteractions,
  checkRegimenInteractions,
  countBySeverity,
  highestSeverity,
  requiresOverride,
} from '@/lib/medications/interactions';
import { computeAdherence, generateAdherenceDoses } from '@/lib/medications/adherence';
import { buildReconciliation, unresolvedCount } from '@/lib/medications/reconciliation';
import type { ReportedMedication } from '@/lib/medications/reconciliation';
import {
  buildPharmacyExport,
  pharmacyExportFilename,
  pharmacyExportToCsv,
} from '@/lib/medications/pharmacy';
import { getSampleMedications, getSamplePatient } from '@/lib/medications/sampleData';
import type { Medication } from '@/lib/medications/types';

const OKAFOR_MEDICATIONS = getSampleMedications('p-1001');

function medicationByDrugId(drugId: string): Medication {
  const found = OKAFOR_MEDICATIONS.find((medication) => medication.drugId === drugId);
  if (!found) throw new Error(`Sample medication not found for drug id ${drugId}`);
  return found;
}

describe('medication search (#1314)', () => {
  it('matches on brand name, generic name and drug class', () => {
    expect(searchDrugs('metfor').map((drug) => drug.id)).toEqual(['metformin']);
    expect(searchDrugs('acetaminophen').map((drug) => drug.id)).toEqual(['paracetamol']);
    expect(searchDrugs('nsaid').map((drug) => drug.id)).toContain('ibuprofen');
  });

  it('returns no suggestions for an empty query', () => {
    expect(searchDrugs('')).toEqual([]);
    expect(searchDrugs('   ')).toEqual([]);
  });

  it('limits the number of suggestions', () => {
    expect(searchDrugs('a', 3)).toHaveLength(3);
  });
});

describe('drug interaction checking (#1314)', () => {
  const ibuprofen = { drugId: 'ibuprofen', drugName: 'Ibuprofen' };

  it('finds both interactions for a candidate against the active regimen', () => {
    const checks = checkInteractions(ibuprofen, OKAFOR_MEDICATIONS);
    expect(checks).toHaveLength(2);
    expect(checks.map((check) => check.interactionId)).toEqual([
      'warfarin-ibuprofen',
      'lisinopril-ibuprofen',
    ]);
  });

  it('sorts findings most severe first', () => {
    const checks = checkInteractions(ibuprofen, OKAFOR_MEDICATIONS);
    expect(checks[0]?.severity).toBe('major');
    expect(checks[1]?.severity).toBe('moderate');
    expect(highestSeverity(checks)).toBe('major');
    expect(requiresOverride(checks)).toBe(true);
  });

  it('ignores medications that are not active', () => {
    // Levothyroxine is on hold for this patient, so the PPI interaction is skipped.
    const checks = checkInteractions(
      { drugId: 'omeprazole', drugName: 'Omeprazole' },
      OKAFOR_MEDICATIONS
    );
    expect(checks).toEqual([]);
    expect(requiresOverride(checks)).toBe(false);
    expect(highestSeverity(checks)).toBeNull();
  });

  it('never flags a drug against itself', () => {
    const checks = checkInteractions(
      { drugId: 'warfarin', drugName: 'Warfarin' },
      OKAFOR_MEDICATIONS
    );
    expect(checks).toEqual([]);
  });

  it('reviews every pair in a regimen', () => {
    const regimen: Medication[] = [
      { ...medicationByDrugId('warfarin'), status: 'active' },
      { ...medicationByDrugId('ibuprofen'), status: 'active' },
    ];
    const checks = checkRegimenInteractions(regimen);
    expect(checks.map((check) => check.interactionId)).toEqual(['warfarin-ibuprofen']);
    expect(checks[0]?.medicationName).toBe('Ibuprofen');
    expect(checks[0]?.candidateName).toBe('Warfarin');
  });

  it('reports no regimen findings for the sample regimen', () => {
    const active = OKAFOR_MEDICATIONS.filter((medication) => medication.status === 'active');
    expect(checkRegimenInteractions(active)).toEqual([]);
  });

  it('counts findings by severity', () => {
    const checks = checkInteractions(ibuprofen, OKAFOR_MEDICATIONS);
    expect(countBySeverity(checks)).toEqual({
      contraindicated: 0,
      major: 1,
      moderate: 1,
      minor: 0,
    });
  });

  it('looks interactions up irrespective of pair order', () => {
    expect(getInteraction('ibuprofen', 'warfarin')?.id).toBe('warfarin-ibuprofen');
    expect(getInteraction('warfarin', 'ibuprofen')?.id).toBe('warfarin-ibuprofen');
    expect(DRUG_INTERACTIONS.length).toBeGreaterThan(0);
    expect(getInteraction('metformin', 'salbutamol')).toBeNull();
  });
});

describe('adherence tracking (#1314)', () => {
  it('computes the adherence rate and category', () => {
    const summary = computeAdherence([
      { date: '2026-09-20', scheduled: 2, taken: 2 },
      { date: '2026-09-21', scheduled: 2, taken: 1 },
    ]);
    expect(summary).toEqual({ scheduled: 4, taken: 3, missed: 1, rate: 75, category: 'fair' });
  });

  it('clamps reported doses to the scheduled amount', () => {
    const summary = computeAdherence([{ date: '2026-09-20', scheduled: 1, taken: 4 }]);
    expect(summary.taken).toBe(1);
    expect(summary.rate).toBe(100);
    expect(summary.category).toBe('excellent');
  });

  it('does not penalise as-needed medications', () => {
    const summary = computeAdherence([{ date: '2026-09-20', scheduled: 0, taken: 0 }]);
    expect(summary.rate).toBe(100);
    expect(summary.missed).toBe(0);
  });

  it('generates a deterministic series for the trailing window', () => {
    const end = new Date('2026-09-24T00:00:00.000Z');
    const first = generateAdherenceDoses('med-1001', 'twice_daily', 7, end);
    const second = generateAdherenceDoses('med-1001', 'twice_daily', 7, end);

    expect(first).toEqual(second);
    expect(first).toHaveLength(7);
    expect(first.reduce((total, dose) => total + dose.scheduled, 0)).toBe(14);
    expect(first.every((dose) => dose.taken <= dose.scheduled)).toBe(true);
  });

  it('skips every other day for alternate-day regimens', () => {
    const doses = generateAdherenceDoses(
      'med-x',
      'every_other_day',
      6,
      new Date('2026-09-24T00:00:00.000Z')
    );
    expect(doses.reduce((total, dose) => total + dose.scheduled, 0)).toBe(3);
  });
});

describe('medication reconciliation (#1314)', () => {
  const reported: ReportedMedication[] = [
    { drugName: 'Metformin', dosage: '500 mg', frequency: 'twice_daily' },
    { drugName: 'Lisinopril', dosage: '20 mg', frequency: 'once_daily' },
    { drugName: 'Paracetamol', dosage: '500 mg', frequency: 'as_needed' },
  ];

  it('classifies matches, dose mismatches and unknown medications', () => {
    const entries = buildReconciliation(OKAFOR_MEDICATIONS, reported);

    expect(entries.find((entry) => entry.drugName === 'Metformin')?.status).toBe('match');
    expect(entries.find((entry) => entry.drugName === 'Lisinopril')?.status).toBe('dose_mismatch');
    expect(entries.find((entry) => entry.drugName === 'Lisinopril')?.dosage).toBe('10 mg → 20 mg');
    expect(entries.find((entry) => entry.drugName === 'Paracetamol')?.status).toBe(
      'missing_in_clinic'
    );
    expect(entries.find((entry) => entry.drugName === 'Warfarin')?.status).toBe(
      'missing_in_patient_report'
    );
  });

  it('excludes discontinued medications and counts unresolved findings', () => {
    const entries = buildReconciliation(OKAFOR_MEDICATIONS, reported);
    expect(entries.some((entry) => entry.drugName === 'Ibuprofen')).toBe(false);
    expect(unresolvedCount(entries)).toBe(5);
  });
});

describe('pharmacy export (#1314)', () => {
  const patient = getSamplePatient('p-1001');

  it('exports only active and on-hold medications', () => {
    const rows = buildPharmacyExport(patient, OKAFOR_MEDICATIONS);
    expect(rows).toHaveLength(5);
    expect(rows.map((row) => row.medication)).not.toContain('Ibuprofen');
    expect(rows.map((row) => row.medication)).toContain('Levothyroxine');
  });

  it('maps dosage, frequency and route for dispensing', () => {
    const rows = buildPharmacyExport(patient, OKAFOR_MEDICATIONS);
    const metformin = rows.find((row) => row.medication === 'Metformin');
    expect(metformin?.dose).toBe('500 mg');
    expect(metformin?.frequency).toBe('Twice daily');
    expect(metformin?.route).toBe('Oral');
    expect(metformin?.patient_mrn).toBe(patient.mrn);
    expect(metformin?.status_key).toBe('active');
  });

  it('serialises a header row plus one row per medication', () => {
    const rows = buildPharmacyExport(patient, OKAFOR_MEDICATIONS);
    const csv = pharmacyExportToCsv(rows);
    const lines = csv.split('\n');

    expect(lines[0]).toContain('patient_mrn');
    expect(lines).toHaveLength(rows.length + 1);
    expect(csv).toContain('Warfarin');
  });

  it('builds a file name containing the patient and the date', () => {
    const name = pharmacyExportFilename(patient, new Date('2026-09-24T00:00:00.000Z'));
    expect(name).toBe('pharmacy-export-ada-okafor-2026-09-24.csv');
  });
});
