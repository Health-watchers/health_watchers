/**
 * Issue #1313 — lab results visualisation domain types.
 *
 * Optional data is modelled as `T | null` rather than `?:` so these types stay
 * compatible with the monorepo `exactOptionalPropertyTypes` setting.
 */

export type LabPanel =
  | 'Renal function'
  | 'Electrolytes'
  | 'Full blood count'
  | 'Liver function'
  | 'Lipid profile'
  | 'Diabetes monitoring'
  | 'Thyroid'
  | 'Inflammation'
  | 'Coagulation';

export type AnalyteKey =
  | 'sodium'
  | 'potassium'
  | 'creatinine'
  | 'egfr'
  | 'fasting_glucose'
  | 'hba1c'
  | 'haemoglobin'
  | 'wbc'
  | 'platelets'
  | 'alt'
  | 'ast'
  | 'total_cholesterol'
  | 'ldl'
  | 'hdl'
  | 'triglycerides'
  | 'tsh'
  | 'crp'
  | 'inr';

/** `critical_low` / `critical_high` drive the critical-value alerting. */
export type ResultFlag = 'normal' | 'low' | 'high' | 'critical_low' | 'critical_high';

export type TrendDirection = 'rising' | 'falling' | 'stable';

export type ResultSetStatus = 'final' | 'preliminary' | 'corrected';

/** Clinical reference definition for a single analyte. */
export interface AnalyteDefinition {
  key: AnalyteKey;
  name: string;
  shortName: string;
  unit: string;
  panel: LabPanel;
  low: number;
  high: number;
  criticalLow: number | null;
  criticalHigh: number | null;
  decimals: number;
  /** Plain-language interpretation guidance shown in the guide tab. */
  interpretation: string;
  /** What a raised value usually means. */
  highMeaning: string;
  /** What a reduced value usually means. */
  lowMeaning: string;
}

export interface AnalyteValue {
  analyte: AnalyteKey;
  value: number;
}

/** One laboratory report (one panel collected at one point in time). */
export interface LabResultSet {
  id: string;
  patientId: string;
  panel: LabPanel;
  collectedAt: string;
  reportedAt: string;
  orderedBy: string;
  status: ResultSetStatus;
  results: AnalyteValue[];
  notes: string;
}

/** A flattened analyte measurement used for tables, charts and exports. */
export interface LabFinding {
  setId: string;
  patientId: string;
  panel: LabPanel;
  collectedAt: string;
  reportedAt: string;
  orderedBy: string;
  status: ResultSetStatus;
  analyte: AnalyteKey;
  name: string;
  shortName: string;
  value: number;
  unit: string;
  referenceRange: string;
  flag: ResultFlag;
  isCritical: boolean;
  definition: AnalyteDefinition;
}

export interface TrendPoint {
  date: string;
  value: number;
  flag: ResultFlag;
}

export interface TrendSummary {
  analyte: AnalyteKey;
  points: TrendPoint[];
  direction: TrendDirection;
  change: number;
  percentChange: number;
}

export interface ComparisonRow {
  analyte: AnalyteKey;
  name: string;
  unit: string;
  previous: number;
  current: number;
  change: number;
  percentChange: number;
  direction: TrendDirection;
  previousFlag: ResultFlag;
  currentFlag: ResultFlag;
}

export interface LabResultsFilters {
  query: string;
  panel: LabPanel | 'all';
  status: ResultSetStatus | 'all';
  dateFrom: string;
  dateTo: string;
  onlyAbnormal: boolean;
  onlyCritical: boolean;
}

/** Result set lookup used by the trend and comparison views. */
export interface ResultSetOption {
  value: string;
  label: string;
}

/** Minimal patient identity needed for lab result capture and export. */
export interface PatientSummary {
  id: string;
  name: string;
  mrn: string;
  dateOfBirth: string;
}
