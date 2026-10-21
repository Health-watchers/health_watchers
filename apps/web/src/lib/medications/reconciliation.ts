import type {
  Medication,
  MedicationFrequency,
  ReconciliationEntry,
  ReconciliationStatus,
} from './types';

/** A medication as listed by the patient (or an external/imported source). */
export interface ReportedMedication {
  drugName: string;
  dosage: string;
  frequency: MedicationFrequency;
}

function normalise(value: string): string {
  return value.trim().toLowerCase();
}

function noteFor(
  status: ReconciliationStatus,
  clinic?: Medication,
  reported?: ReportedMedication
): string {
  if (status === 'match') return 'Clinic record and patient report agree.';
  if (status === 'dose_mismatch') {
    const clinicDose = clinic ? clinic.dosage : 'unknown';
    const reportedDose = reported ? reported.dosage : 'unknown';
    return `Clinic records ${clinicDose} but the patient reports ${reportedDose}.`;
  }
  if (status === 'missing_in_clinic') {
    return 'Patient reports taking this but it is not on the clinic list — verify before continuing.';
  }
  return 'On the clinic list but not reported by the patient — confirm adherence or stop the order.';
}

/**
 * Medication reconciliation between the clinic's list and the medications the
 * patient reports taking. Pure function — the reconciliation view renders it
 * and lets the clinician resolve each discrepancy.
 */
export function buildReconciliation(
  clinicMedications: readonly Medication[],
  reportedMedications: readonly ReportedMedication[]
): ReconciliationEntry[] {
  const entries: ReconciliationEntry[] = [];
  const inScope = clinicMedications.filter(
    (medication) => medication.status === 'active' || medication.status === 'on_hold'
  );
  const matchedReported = new Set<string>();

  inScope.forEach((medication, index) => {
    const reported = reportedMedications.find(
      (item) => normalise(item.drugName) === normalise(medication.drugName)
    );

    if (!reported) {
      entries.push({
        id: `recon-${index}-missing-report`,
        drugName: medication.drugName,
        dosage: medication.dosage,
        frequency: medication.frequency,
        source: 'clinic',
        status: 'missing_in_patient_report',
        note: noteFor('missing_in_patient_report', medication),
      });
      return;
    }

    matchedReported.add(normalise(reported.drugName));
    const sameDose = normalise(reported.dosage) === normalise(medication.dosage);
    const status: ReconciliationStatus = sameDose ? 'match' : 'dose_mismatch';

    entries.push({
      id: `recon-${index}-${status}`,
      drugName: medication.drugName,
      dosage: sameDose ? medication.dosage : `${medication.dosage} → ${reported.dosage}`,
      frequency: medication.frequency,
      source: 'clinic',
      status,
      note: noteFor(status, medication, reported),
    });
  });

  reportedMedications.forEach((reported, index) => {
    if (matchedReported.has(normalise(reported.drugName))) return;
    entries.push({
      id: `recon-reported-${index}`,
      drugName: reported.drugName,
      dosage: reported.dosage,
      frequency: reported.frequency,
      source: 'patient_reported',
      status: 'missing_in_clinic',
      note: noteFor('missing_in_clinic', undefined, reported),
    });
  });

  return entries;
}

/** Count of entries that still need clinician action. */
export function unresolvedCount(entries: readonly ReconciliationEntry[]): number {
  return entries.filter((entry) => entry.status !== 'match').length;
}
