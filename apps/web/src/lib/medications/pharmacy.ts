import { downloadCsv, objectsToCsv } from '@/lib/utils';
import { FREQUENCY_LABELS, ROUTE_LABELS, STATUS_LABELS } from './labels';
import type { Medication, MedicationStatus, PatientSummary } from './types';

/**
 * Flat row shape consumed by dispensing/pharmacy systems.
 * Declared as a type alias (not an interface) so it stays assignable to
 * `Record<string, unknown>` for the shared CSV serialiser.
 */
export type PharmacyExportRow = {
  patient_name: string;
  patient_mrn: string;
  medication: string;
  generic_name: string;
  drug_class: string;
  dose: string;
  frequency: string;
  route: string;
  quantity: number;
  refills_remaining: number;
  instructions: string;
  prescriber: string;
  start_date: string;
  last_filled: string;
  status: string;
  /** Raw status so the UI can colour the preview without string matching. */
  status_key: MedicationStatus;
};

/**
 * Builds the pharmacy hand-off payload from a patient's regimen.
 * Only medications the pharmacy should still dispense are included.
 */
export function buildPharmacyExport(
  patient: PatientSummary,
  medications: readonly Medication[]
): PharmacyExportRow[] {
  const dispensable = medications.filter(
    (medication) => medication.status === 'active' || medication.status === 'on_hold'
  );

  return dispensable.map((medication) => ({
    patient_name: patient.name,
    patient_mrn: patient.mrn,
    medication: medication.drugName,
    generic_name: medication.genericName,
    drug_class: medication.drugClass,
    dose: medication.dosage,
    frequency: FREQUENCY_LABELS[medication.frequency],
    route: ROUTE_LABELS[medication.route],
    quantity: medication.quantity,
    refills_remaining: medication.refillsRemaining,
    instructions: medication.instructions,
    prescriber: medication.prescriber,
    start_date: medication.startDate,
    last_filled: medication.lastFilledAt ?? '',
    status: STATUS_LABELS[medication.status],
    status_key: medication.status,
  }));
}

export function pharmacyExportToCsv(rows: readonly PharmacyExportRow[]): string {
  // Explicit cast: the shared serialiser accepts a generic record map.
  return objectsToCsv(rows as Record<string, unknown>[]);
}

export function pharmacyExportFilename(patient: PatientSummary, asOf: Date = new Date()): string {
  const safeName = patient.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  return `pharmacy-export-${safeName}-${asOf.toISOString().slice(0, 10)}.csv`;
}

/** Convenience helper used by the export button. */
export function downloadPharmacyExport(
  patient: PatientSummary,
  medications: readonly Medication[]
): number {
  const rows = buildPharmacyExport(patient, medications);
  const csv = pharmacyExportToCsv(rows);
  downloadCsv(csv, pharmacyExportFilename(patient));
  return rows.length;
}
