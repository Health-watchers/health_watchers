import { getDrugById } from './catalog';
import type {
  Drug,
  Medication,
  MedicationFrequency,
  MedicationSource,
  MedicationStatus,
  PatientSummary,
  RefillRequest,
  SideEffectReport,
  MedicationHistoryEvent,
} from './types';
import type { ReportedMedication } from './reconciliation';

/**
 * Demo data for the medication manager. The page prefers the live
 * `/api/v1/medications` endpoint and falls back to this dataset when the API is
 * unavailable, so the UI is fully explorable in local development.
 */

export const SAMPLE_PATIENTS: PatientSummary[] = [
  { id: 'p-1001', name: 'Ada Okafor', mrn: 'MRN-1001', dateOfBirth: '1968-04-12' },
  { id: 'p-1002', name: 'Chinedu Balogun', mrn: 'MRN-1002', dateOfBirth: '1979-11-02' },
];

function drug(drugId: string): Drug {
  const found = getDrugById(drugId);
  if (!found) throw new Error(`Unknown formulary drug: ${drugId}`);
  return found;
}

interface MedicationSeed {
  id: string;
  patientId: string;
  drugId: string;
  dosage: string;
  frequency: MedicationFrequency;
  startDate: string;
  prescriber: string;
  indication: string;
  instructions: string;
  quantity: number;
  refillsRemaining: number;
  status?: MedicationStatus;
  source?: MedicationSource;
  lastFilledAt?: string | null;
  endDate?: string | null;
  discontinuedReason?: string | null;
  discontinuedBy?: string | null;
  discontinuedAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

function createMedication(seed: MedicationSeed): Medication {
  const formularyDrug = drug(seed.drugId);
  return {
    id: seed.id,
    patientId: seed.patientId,
    drugId: formularyDrug.id,
    drugName: formularyDrug.name,
    genericName: formularyDrug.genericName,
    drugClass: formularyDrug.drugClass,
    route: formularyDrug.defaultRoute,
    dosage: seed.dosage,
    frequency: seed.frequency,
    startDate: seed.startDate,
    status: seed.status ?? 'active',
    prescriber: seed.prescriber,
    indication: seed.indication,
    instructions: seed.instructions,
    quantity: seed.quantity,
    refillsRemaining: seed.refillsRemaining,
    lastFilledAt: seed.lastFilledAt ?? null,
    endDate: seed.endDate ?? null,
    discontinuedReason: seed.discontinuedReason ?? null,
    discontinuedBy: seed.discontinuedBy ?? null,
    discontinuedAt: seed.discontinuedAt ?? null,
    source: seed.source ?? 'clinic',
    createdAt: seed.createdAt ?? seed.startDate,
    updatedAt: seed.updatedAt ?? seed.startDate,
  };
}

const DR_OKAFOR = 'Dr. Ngozi Eze';
const DR_BALOGUN = 'Dr. Samuel Adeyemi';

export const SAMPLE_MEDICATIONS: Medication[] = [
  createMedication({
    id: 'med-1001',
    patientId: 'p-1001',
    drugId: 'metformin',
    dosage: '500 mg',
    frequency: 'twice_daily',
    startDate: '2025-02-14',
    prescriber: DR_OKAFOR,
    indication: 'Type 2 diabetes mellitus',
    instructions: 'Take with meals to reduce gastrointestinal upset.',
    quantity: 60,
    refillsRemaining: 2,
    lastFilledAt: '2026-08-18',
  }),
  createMedication({
    id: 'med-1002',
    patientId: 'p-1001',
    drugId: 'lisinopril',
    dosage: '10 mg',
    frequency: 'once_daily',
    startDate: '2025-06-03',
    prescriber: DR_OKAFOR,
    indication: 'Hypertension',
    instructions: 'Take in the morning. Report persistent dry cough.',
    quantity: 30,
    refillsRemaining: 3,
    lastFilledAt: '2026-08-18',
  }),
  createMedication({
    id: 'med-1003',
    patientId: 'p-1001',
    drugId: 'atorvastatin',
    dosage: '20 mg',
    frequency: 'once_daily',
    startDate: '2025-06-03',
    prescriber: DR_OKAFOR,
    indication: 'Hyperlipidaemia',
    instructions: 'Take at night. Report unexplained muscle pain.',
    quantity: 30,
    refillsRemaining: 1,
    lastFilledAt: '2026-07-20',
  }),
  createMedication({
    id: 'med-1004',
    patientId: 'p-1001',
    drugId: 'warfarin',
    dosage: '5 mg',
    frequency: 'once_daily',
    startDate: '2026-01-09',
    prescriber: DR_OKAFOR,
    indication: 'Atrial fibrillation — stroke prevention',
    instructions: 'Keep a stable vitamin K intake. Attend INR monitoring appointments.',
    quantity: 30,
    refillsRemaining: 0,
    lastFilledAt: '2026-08-22',
    status: 'active',
    updatedAt: '2026-08-22',
  }),
  createMedication({
    id: 'med-1005',
    patientId: 'p-1001',
    drugId: 'ibuprofen',
    dosage: '400 mg',
    frequency: 'three_times_daily',
    startDate: '2026-03-02',
    prescriber: DR_OKAFOR,
    indication: 'Knee osteoarthritis',
    instructions: 'Take with food. Short-term use only.',
    quantity: 30,
    refillsRemaining: 0,
    status: 'discontinued',
    endDate: '2026-03-11',
    discontinuedReason: 'Interaction — bleeding risk with warfarin',
    discontinuedBy: DR_OKAFOR,
    discontinuedAt: '2026-03-11',
    updatedAt: '2026-03-11',
  }),
  createMedication({
    id: 'med-1006',
    patientId: 'p-1001',
    drugId: 'levothyroxine',
    dosage: '50 mcg',
    frequency: 'once_daily',
    startDate: '2026-05-05',
    prescriber: DR_OKAFOR,
    indication: 'Hypothyroidism',
    instructions: 'Take on an empty stomach 30–60 minutes before breakfast.',
    quantity: 30,
    refillsRemaining: 2,
    status: 'on_hold',
    lastFilledAt: '2026-07-01',
    updatedAt: '2026-08-30',
  }),
  createMedication({
    id: 'med-2001',
    patientId: 'p-1002',
    drugId: 'amlodipine',
    dosage: '5 mg',
    frequency: 'once_daily',
    startDate: '2025-09-19',
    prescriber: DR_BALOGUN,
    indication: 'Hypertension',
    instructions: 'Take at the same time each day. Report ankle swelling.',
    quantity: 30,
    refillsRemaining: 4,
    lastFilledAt: '2026-08-14',
  }),
  createMedication({
    id: 'med-2002',
    patientId: 'p-1002',
    drugId: 'sertraline',
    dosage: '50 mg',
    frequency: 'once_daily',
    startDate: '2026-04-21',
    prescriber: DR_BALOGUN,
    indication: 'Depression',
    instructions: 'Take in the morning. Do not stop abruptly.',
    quantity: 30,
    refillsRemaining: 2,
    lastFilledAt: '2026-08-25',
  }),
];

export const SAMPLE_REFILL_REQUESTS: RefillRequest[] = [
  {
    id: 'refill-1',
    medicationId: 'med-1004',
    medicationName: 'Warfarin',
    requestedAt: '2026-09-02T09:15:00.000Z',
    requestedBy: 'Ada Okafor',
    pharmacy: 'Meadow Community Pharmacy',
    status: 'pending',
    notes: 'Ran out two days ago, next INR appointment is Friday.',
  },
  {
    id: 'refill-2',
    medicationId: 'med-1003',
    medicationName: 'Atorvastatin',
    requestedAt: '2026-08-28T14:40:00.000Z',
    requestedBy: 'Ada Okafor',
    pharmacy: 'Meadow Community Pharmacy',
    status: 'approved',
    notes: '',
  },
  {
    id: 'refill-3',
    medicationId: 'med-1001',
    medicationName: 'Metformin',
    requestedAt: '2026-08-18T08:05:00.000Z',
    requestedBy: 'Clinic dispensary',
    pharmacy: 'HealthWatchers Clinic Pharmacy',
    status: 'dispensed',
    notes: '60 tablets dispensed, counselling provided.',
  },
];

export const SAMPLE_SIDE_EFFECT_REPORTS: SideEffectReport[] = [
  {
    id: 'se-1',
    medicationId: 'med-1002',
    medicationName: 'Lisinopril',
    reportedAt: '2026-08-04T11:20:00.000Z',
    reportedBy: 'Ada Okafor',
    severity: 'moderate',
    symptoms: ['Dry cough', 'Dizziness'],
    description: 'Persistent dry cough for three weeks, worse at night.',
    actionTaken: 'Reviewed at clinic — continued with review in 4 weeks.',
  },
  {
    id: 'se-2',
    medicationId: 'med-1001',
    medicationName: 'Metformin',
    reportedAt: '2026-07-12T16:00:00.000Z',
    reportedBy: 'Ada Okafor',
    severity: 'mild',
    symptoms: ['Nausea', 'Abdominal pain'],
    description: 'Nausea during the first week of the dose increase.',
    actionTaken: 'Advised to take with food; symptoms resolved.',
  },
];

export const SAMPLE_HISTORY: MedicationHistoryEvent[] = [
  {
    id: 'hist-1',
    medicationId: 'med-1001',
    medicationName: 'Metformin',
    type: 'created',
    at: '2025-02-14T09:00:00.000Z',
    actor: DR_OKAFOR,
    summary: 'Started 500 mg twice daily for type 2 diabetes.',
  },
  {
    id: 'hist-2',
    medicationId: 'med-1002',
    medicationName: 'Lisinopril',
    type: 'created',
    at: '2025-06-03T10:30:00.000Z',
    actor: DR_OKAFOR,
    summary: 'Started 10 mg once daily for hypertension.',
  },
  {
    id: 'hist-3',
    medicationId: 'med-1004',
    medicationName: 'Warfarin',
    type: 'created',
    at: '2026-01-09T08:45:00.000Z',
    actor: DR_OKAFOR,
    summary: 'Started 5 mg once daily for atrial fibrillation.',
  },
  {
    id: 'hist-4',
    medicationId: 'med-1004',
    medicationName: 'Warfarin',
    type: 'dosage_changed',
    at: '2026-02-20T09:10:00.000Z',
    actor: DR_OKAFOR,
    summary: 'Dose adjusted from 4 mg to 5 mg after an INR of 1.6.',
  },
  {
    id: 'hist-5',
    medicationId: 'med-1005',
    medicationName: 'Ibuprofen',
    type: 'side_effect_reported',
    at: '2026-03-10T15:25:00.000Z',
    actor: 'Ada Okafor',
    summary: 'Reported easy bruising while taking ibuprofen with warfarin.',
  },
  {
    id: 'hist-6',
    medicationId: 'med-1005',
    medicationName: 'Ibuprofen',
    type: 'discontinued',
    at: '2026-03-11T09:05:00.000Z',
    actor: DR_OKAFOR,
    summary: 'Discontinued — bleeding risk with warfarin. Switched to paracetamol.',
  },
  {
    id: 'hist-7',
    medicationId: 'med-1006',
    medicationName: 'Levothyroxine',
    type: 'status_changed',
    at: '2026-08-30T12:00:00.000Z',
    actor: DR_OKAFOR,
    summary: 'Placed on hold pending thyroid function results.',
  },
  {
    id: 'hist-8',
    medicationId: 'med-1004',
    medicationName: 'Warfarin',
    type: 'refill_requested',
    at: '2026-09-02T09:15:00.000Z',
    actor: 'Ada Okafor',
    summary: 'Refill requested from Meadow Community Pharmacy.',
  },
  {
    id: 'hist-9',
    medicationId: 'med-1001',
    medicationName: 'Metformin',
    type: 'refill_requested',
    at: '2026-08-18T08:05:00.000Z',
    actor: 'Clinic dispensary',
    summary: 'Refill dispensed — 60 tablets.',
  },
];

/** What the patient reports taking (used by the reconciliation workflow). */
export const SAMPLE_REPORTED_MEDICATIONS: ReportedMedication[] = [
  { drugName: 'Metformin', dosage: '500 mg', frequency: 'twice_daily' },
  { drugName: 'Lisinopril', dosage: '20 mg', frequency: 'once_daily' },
  { drugName: 'Warfarin', dosage: '5 mg', frequency: 'once_daily' },
  { drugName: 'Paracetamol', dosage: '500 mg', frequency: 'as_needed' },
];

export function getSampleMedications(patientId: string): Medication[] {
  return SAMPLE_MEDICATIONS.filter((medication) => medication.patientId === patientId);
}

export function getSamplePatient(patientId: string): PatientSummary {
  const found = SAMPLE_PATIENTS.find((patient) => patient.id === patientId);
  return found ?? (SAMPLE_PATIENTS[0] as PatientSummary);
}

