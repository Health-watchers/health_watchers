import { downloadCsv, objectsToCsv } from '@/lib/utils';
import { isAbnormalFlag } from './evaluation';
import { formatAnalyteValue } from './referenceRanges';
import type { LabFinding, PatientSummary } from './types';

/**
 * Flat row shape used for lab result exports.
 * Declared as a type alias (not an interface) so it stays assignable to
 * `Record<string, unknown>` for the shared CSV serialiser.
 */
export type LabExportRow = {
  patient_name: string;
  patient_mrn: string;
  collected_at: string;
  reported_at: string;
  panel: string;
  analyte: string;
  value: string;
  unit: string;
  reference_range: string;
  flag: string;
  status: string;
  ordered_by: string;
};

export function buildLabExportRows(
  patient: PatientSummary,
  findings: readonly LabFinding[]
): LabExportRow[] {
  return findings.map((finding) => ({
    patient_name: patient.name,
    patient_mrn: patient.mrn,
    collected_at: finding.collectedAt.slice(0, 10),
    reported_at: finding.reportedAt.slice(0, 10),
    panel: finding.panel,
    analyte: finding.name,
    value: formatAnalyteValue(finding.definition, finding.value),
    unit: finding.unit,
    reference_range: `${finding.definition.low}–${finding.definition.high}`,
    flag: finding.flag,
    status: finding.status,
    ordered_by: finding.orderedBy,
  }));
}

export function labExportToCsv(rows: readonly LabExportRow[]): string {
  // Explicit cast: the shared serialiser accepts a generic record map.
  return objectsToCsv(rows as Record<string, unknown>[]);
}

export function labExportFilename(patient: PatientSummary, asOf: Date = new Date()): string {
  const safeName = patient.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  return `lab-results-${safeName}-${asOf.toISOString().slice(0, 10)}.csv`;
}

export interface LabExportSummary {
  rows: number;
  abnormal: number;
  critical: number;
}

export function labExportSummary(findings: readonly LabFinding[]): LabExportSummary {
  return {
    rows: findings.length,
    abnormal: findings.filter((finding) => isAbnormalFlag(finding.flag)).length,
    critical: findings.filter((finding) => finding.isCritical).length,
  };
}

/** Convenience helper used by the export button. */
export function downloadLabExport(
  patient: PatientSummary,
  findings: readonly LabFinding[]
): LabExportSummary {
  const rows = buildLabExportRows(patient, findings);
  downloadCsv(labExportToCsv(rows), labExportFilename(patient));
  return labExportSummary(findings);
}
