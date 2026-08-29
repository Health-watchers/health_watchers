import mongoose from 'mongoose';
import type { Encounter } from '@api/modules/encounters/encounter.model';

let seq = 0;

function nextSeq() {
  return ++seq;
}

export function buildEncounter(overrides: Partial<Encounter> = {}): Partial<Encounter> {
  const i = nextSeq();
  return {
    patientId: new mongoose.Types.ObjectId(),
    clinicId: new mongoose.Types.ObjectId(),
    attendingDoctorId: new mongoose.Types.ObjectId(),
    chiefComplaint: `Chief complaint ${i}`,
    status: 'open',
    type: 'consultation',
    isActive: true,
    ...overrides,
  };
}

export function buildEncounterWithVitals(overrides: Partial<Encounter> = {}): Partial<Encounter> {
  return buildEncounter({
    vitalSigns: {
      bloodPressure: '120/80',
      heartRate: 72,
      temperature: 98.6,
      respiratoryRate: 16,
      oxygenSaturation: 98,
      weight: 70,
      height: 170,
    },
    ...overrides,
  });
}

export function buildEncounterWithDiagnosis(
  overrides: Partial<Encounter> = {}
): Partial<Encounter> {
  return buildEncounter({
    diagnosis: [
      { code: 'J06.9', description: 'Acute upper respiratory infection', isPrimary: true },
    ],
    soapNotes: {
      subjective: 'Patient reports sore throat and mild fever for 2 days.',
      objective: 'Temp 100.4F, pharynx erythematous, no exudate.',
      assessment: 'Viral upper respiratory infection.',
      plan: 'Rest, fluids, OTC analgesics. Return if symptoms worsen.',
    },
    ...overrides,
  });
}

export function buildEncounterWithBilling(overrides: Partial<Encounter> = {}): Partial<Encounter> {
  return buildEncounter({
    billing: {
      cptCodes: [
        {
          code: '99213',
          description: 'Office visit, established patient',
          units: 1,
          fee: '150.00',
        },
      ],
      billingStatus: 'unbilled',
      totalFee: '150.00',
    },
    ...overrides,
  });
}

/** Closed/completed encounter — useful for reporting and archival tests. */
export function buildClosedEncounter(overrides: Partial<Encounter> = {}): Partial<Encounter> {
  return buildEncounterWithDiagnosis({
    status: 'closed',
    closedAt: new Date(),
    ...overrides,
  });
}

/** Telemedicine encounter variant. */
export function buildTelemedicineEncounter(overrides: Partial<Encounter> = {}): Partial<Encounter> {
  return buildEncounter({
    type: 'telemedicine',
    ...overrides,
  });
}

/** Emergency encounter variant. */
export function buildEmergencyEncounter(overrides: Partial<Encounter> = {}): Partial<Encounter> {
  return buildEncounterWithVitals({
    type: 'emergency',
    chiefComplaint: 'Chest pain, shortness of breath',
    ...overrides,
  });
}

export function buildEncounterBatch(
  count: number,
  overrides: Partial<Encounter> = {}
): Partial<Encounter>[] {
  return Array.from({ length: count }, () => buildEncounter(overrides));
}
