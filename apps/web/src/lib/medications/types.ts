/**
 * Issue #1314 — Medication list manager domain types.
 *
 * Optional data is modelled as `T | null` rather than `?:` so the domain objects
 * satisfy the monorepo `exactOptionalPropertyTypes` compiler setting.
 */

export type MedicationStatus = 'active' | 'on_hold' | 'discontinued' | 'completed';

export type MedicationFrequency =
  | 'once_daily'
  | 'twice_daily'
  | 'three_times_daily'
  | 'four_times_daily'
  | 'every_other_day'
  | 'weekly'
  | 'as_needed';

export type MedicationRoute =
  | 'oral'
  | 'topical'
  | 'inhalation'
  | 'injection'
  | 'sublingual'
  | 'rectal';

export type MedicationSource = 'clinic' | 'patient_reported' | 'pharmacy';

export type InteractionSeverity = 'contraindicated' | 'major' | 'moderate' | 'minor';

/** A drug in the local formulary used to power search + autocomplete. */
export interface Drug {
  id: string;
  name: string;
  genericName: string;
  drugClass: string;
  commonDosages: string[];
  defaultRoute: MedicationRoute;
}

/** A known interaction between two formulary drugs. */
export interface DrugInteraction {
  id: string;
  drugIds: readonly [string, string];
  severity: InteractionSeverity;
  description: string;
  management: string;
}

export interface Medication {
  id: string;
  patientId: string;
  drugId: string;
  drugName: string;
  genericName: string;
  drugClass: string;
  route: MedicationRoute;
  dosage: string;
  frequency: MedicationFrequency;
  startDate: string;
  status: MedicationStatus;
  prescriber: string;
  indication: string;
  instructions: string;
  quantity: number;
  refillsRemaining: number;
  lastFilledAt: string | null;
  endDate: string | null;
  discontinuedReason: string | null;
  discontinuedBy: string | null;
  discontinuedAt: string | null;
  source: MedicationSource;
  createdAt: string;
  updatedAt: string;
}

/** Payload emitted by the "add medication" form before it is persisted. */
export interface NewMedicationInput {
  drugId: string;
  drugName: string;
  genericName: string;
  drugClass: string;
  route: MedicationRoute;
  dosage: string;
  frequency: MedicationFrequency;
  startDate: string;
  indication: string;
  instructions: string;
  quantity: number;
  refillsRemaining: number;
  prescriber: string;
  source: MedicationSource;
}

/**
 * A single interaction finding produced by `checkInteractions`.
 * `candidateName` is the drug being added, `medicationName` the existing one.
 */
export interface InteractionCheck {
  interactionId: string;
  severity: InteractionSeverity;
  description: string;
  management: string;
  medicationId: string;
  medicationName: string;
  candidateName: string;
}

export type RefillStatus = 'pending' | 'approved' | 'denied' | 'dispensed';

export interface RefillRequest {
  id: string;
  medicationId: string;
  medicationName: string;
  requestedAt: string;
  requestedBy: string;
  pharmacy: string;
  status: RefillStatus;
  notes: string;
}

export type SideEffectSeverity = 'mild' | 'moderate' | 'severe';

export interface SideEffectReport {
  id: string;
  medicationId: string;
  medicationName: string;
  reportedAt: string;
  reportedBy: string;
  severity: SideEffectSeverity;
  symptoms: string[];
  description: string;
  actionTaken: string;
}

export type HistoryEventType =
  | 'created'
  | 'dosage_changed'
  | 'status_changed'
  | 'refill_requested'
  | 'side_effect_reported'
  | 'discontinued'
  | 'reconciled';

export interface MedicationHistoryEvent {
  id: string;
  medicationId: string;
  medicationName: string;
  type: HistoryEventType;
  at: string;
  actor: string;
  summary: string;
}

/** One day of adherence data: how many doses were due vs actually taken. */
export interface AdherenceDose {
  date: string;
  scheduled: number;
  taken: number;
}

export type AdherenceCategory = 'excellent' | 'good' | 'fair' | 'poor';

export interface AdherenceSummary {
  scheduled: number;
  taken: number;
  missed: number;
  /** Percentage of scheduled doses taken (100 when nothing was scheduled). */
  rate: number;
  category: AdherenceCategory;
}

export type ReconciliationStatus =
  | 'match'
  | 'missing_in_clinic'
  | 'missing_in_patient_report'
  | 'dose_mismatch';

export interface ReconciliationEntry {
  id: string;
  drugName: string;
  dosage: string;
  frequency: MedicationFrequency;
  source: MedicationSource;
  status: ReconciliationStatus;
  note: string;
}

export interface PatientSummary {
  id: string;
  name: string;
  mrn: string;
  dateOfBirth: string;
}
