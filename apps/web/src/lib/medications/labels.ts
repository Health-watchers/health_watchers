import type {
  AdherenceCategory,
  HistoryEventType,
  InteractionSeverity,
  MedicationFrequency,
  MedicationRoute,
  MedicationStatus,
  MedicationSource,
  RefillStatus,
  ReconciliationStatus,
  SideEffectSeverity,
} from './types';

export const FREQUENCY_LABELS: Record<MedicationFrequency, string> = {
  once_daily: 'Once daily',
  twice_daily: 'Twice daily',
  three_times_daily: 'Three times daily',
  four_times_daily: 'Four times daily',
  every_other_day: 'Every other day',
  weekly: 'Weekly',
  as_needed: 'As needed (PRN)',
};

export const FREQUENCY_OPTIONS: { value: MedicationFrequency; label: string }[] = (
  Object.keys(FREQUENCY_LABELS) as MedicationFrequency[]
).map((value) => ({ value, label: FREQUENCY_LABELS[value] }));

export const ROUTE_LABELS: Record<MedicationRoute, string> = {
  oral: 'Oral',
  topical: 'Topical',
  inhalation: 'Inhalation',
  injection: 'Injection',
  sublingual: 'Sublingual',
  rectal: 'Rectal',
};

export const ROUTE_OPTIONS: { value: MedicationRoute; label: string }[] = (
  Object.keys(ROUTE_LABELS) as MedicationRoute[]
).map((value) => ({ value, label: ROUTE_LABELS[value] }));

export const STATUS_LABELS: Record<MedicationStatus, string> = {
  active: 'Active',
  on_hold: 'On hold',
  discontinued: 'Discontinued',
  completed: 'Completed',
};

export const STATUS_OPTIONS: { value: MedicationStatus; label: string }[] = (
  Object.keys(STATUS_LABELS) as MedicationStatus[]
).map((value) => ({ value, label: STATUS_LABELS[value] }));

export const SOURCE_LABELS: Record<MedicationSource, string> = {
  clinic: 'Prescribed in clinic',
  patient_reported: 'Patient reported',
  pharmacy: 'Pharmacy record',
};

export const REFILL_STATUS_LABELS: Record<RefillStatus, string> = {
  pending: 'Pending review',
  approved: 'Approved',
  denied: 'Denied',
  dispensed: 'Dispensed',
};

export const SEVERITY_LABELS: Record<InteractionSeverity, string> = {
  contraindicated: 'Contraindicated',
  major: 'Major',
  moderate: 'Moderate',
  minor: 'Minor',
};

export const SIDE_EFFECT_SEVERITY_LABELS: Record<SideEffectSeverity, string> = {
  mild: 'Mild',
  moderate: 'Moderate',
  severe: 'Severe',
};

export const ADHERENCE_LABELS: Record<AdherenceCategory, string> = {
  excellent: 'Excellent',
  good: 'Good',
  fair: 'Fair',
  poor: 'Poor',
};

export const HISTORY_EVENT_LABELS: Record<HistoryEventType, string> = {
  created: 'Started',
  dosage_changed: 'Dose changed',
  status_changed: 'Status changed',
  refill_requested: 'Refill requested',
  side_effect_reported: 'Side effect reported',
  discontinued: 'Discontinued',
  reconciled: 'Reconciled',
};

export const RECONCILIATION_LABELS: Record<ReconciliationStatus, string> = {
  match: 'Match',
  missing_in_clinic: 'On patient list only',
  missing_in_patient_report: 'On clinic list only',
  dose_mismatch: 'Dose differs',
};

/** Tailwind badge variant for an interaction severity. */
export function severityBadgeVariant(
  severity: InteractionSeverity
): 'danger' | 'warning' | 'default' {
  if (severity === 'contraindicated' || severity === 'major') return 'danger';
  if (severity === 'moderate') return 'warning';
  return 'default';
}

export function statusBadgeVariant(
  status: MedicationStatus
): 'success' | 'warning' | 'danger' | 'default' {
  if (status === 'active') return 'success';
  if (status === 'on_hold') return 'warning';
  if (status === 'discontinued') return 'danger';
  return 'default';
}

export function adherenceBadgeVariant(
  category: AdherenceCategory
): 'success' | 'primary' | 'warning' | 'danger' {
  if (category === 'excellent') return 'success';
  if (category === 'good') return 'primary';
  if (category === 'fair') return 'warning';
  return 'danger';
}

export function refillBadgeVariant(
  status: RefillStatus
): 'success' | 'warning' | 'danger' | 'default' {
  if (status === 'dispensed' || status === 'approved') return 'success';
  if (status === 'pending') return 'warning';
  return 'danger';
}

export function sideEffectBadgeVariant(
  severity: SideEffectSeverity
): 'warning' | 'danger' | 'default' {
  if (severity === 'severe') return 'danger';
  if (severity === 'moderate') return 'warning';
  return 'default';
}
