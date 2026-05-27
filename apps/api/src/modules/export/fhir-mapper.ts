/**
 * FHIR R4 resource mappers for Health Watchers patient data.
 * Spec: https://hl7.org/fhir/R4/
 */

import { Patient } from '@api/modules/patients/models/patient.model';
import { Encounter, VitalSigns, Prescription, Diagnosis } from '@api/modules/encounters/encounter.model';

// ─── FHIR R4 type stubs (minimal, sufficient for our resources) ────────────

export interface FhirCoding {
  system: string;
  code: string;
  display?: string;
}

export interface FhirCodeableConcept {
  coding?: FhirCoding[];
  text?: string;
}

export interface FhirReference {
  reference: string;
}

export interface FhirPatient {
  resourceType: 'Patient';
  id: string;
  identifier: Array<{ system: string; value: string }>;
  name: Array<{ use: string; family: string; given: string[] }>;
  gender: 'male' | 'female' | 'other' | 'unknown';
  birthDate?: string;
  telecom?: Array<{ system: string; value: string; use: string }>;
  address?: Array<{ text: string }>;
}

export interface FhirCondition {
  resourceType: 'Condition';
  id: string;
  subject: FhirReference;
  encounter: FhirReference;
  code: FhirCodeableConcept;
  clinicalStatus: FhirCodeableConcept;
  category: FhirCodeableConcept[];
}

export interface FhirEncounter {
  resourceType: 'Encounter';
  id: string;
  status: string;
  class: FhirCoding;
  subject: FhirReference;
  reasonCode?: FhirCodeableConcept[];
  diagnosis?: Array<{ condition: FhirReference; use?: FhirCodeableConcept }>;
  period?: { start?: string };
}

export interface FhirObservation {
  resourceType: 'Observation';
  id: string;
  status: 'final';
  category: FhirCodeableConcept[];
  code: FhirCodeableConcept;
  subject: FhirReference;
  encounter: FhirReference;
  valueQuantity?: { value: number; unit: string; system: string; code: string };
  valueString?: string;
  component?: Array<{
    code: FhirCodeableConcept;
    valueQuantity?: { value: number; unit: string; system: string; code: string };
    valueString?: string;
  }>;
}

export interface FhirMedicationRequest {
  resourceType: 'MedicationRequest';
  id: string;
  status: 'active' | 'completed' | 'stopped';
  intent: 'order';
  medicationCodeableConcept: FhirCodeableConcept;
  subject: FhirReference;
  encounter: FhirReference;
  authoredOn?: string;
  dosageInstruction?: Array<{
    text: string;
    route?: FhirCodeableConcept;
    timing?: { repeat?: { boundsDuration?: { value: number; unit: string; system: string; code: string } } };
  }>;
  dispenseRequest?: { numberOfRepeatsAllowed: number };
}

export type FhirResource = FhirPatient | FhirEncounter | FhirCondition | FhirObservation | FhirMedicationRequest;

export interface FhirBundle {
  resourceType: 'Bundle';
  type: 'collection';
  timestamp: string;
  entry: Array<{ resource: FhirResource }>;
}

// ─── Sex mapping ───────────────────────────────────────────────────────────

function toFhirGender(sex: 'M' | 'F' | 'O'): FhirPatient['gender'] {
  if (sex === 'M') return 'male';
  if (sex === 'F') return 'female';
  return 'other';
}

// ─── Encounter status mapping ──────────────────────────────────────────────

function toFhirEncounterStatus(status: Encounter['status']): string {
  const map: Record<Encounter['status'], string> = {
    open: 'in-progress',
    closed: 'finished',
    'follow-up': 'finished',
    cancelled: 'cancelled',
    pending_cosignature: 'in-progress',
  };
  return map[status] ?? 'unknown';
}

// ─── Route mapping ─────────────────────────────────────────────────────────

function toFhirRoute(route: Prescription['route']): FhirCodeableConcept {
  const map: Record<Prescription['route'], { code: string; display: string }> = {
    oral:      { code: '26643006', display: 'Oral route' },
    topical:   { code: '6064005',  display: 'Topical route' },
    injection: { code: '47625008', display: 'Intravenous route' },
    inhaled:   { code: '18679011000001101', display: 'Inhalation route' },
    other:     { code: '74964007', display: 'Other route' },
  };
  const entry = map[route] ?? map.other;
  return { coding: [{ system: 'http://snomed.info/sct', ...entry }], text: entry.display };
}

// ─── Vital sign LOINC codes ────────────────────────────────────────────────

const VITAL_LOINC: Record<string, { code: string; display: string; unit: string; ucum: string }> = {
  heartRate:        { code: '8867-4',  display: 'Heart rate',           unit: 'beats/min', ucum: '/min' },
  temperature:      { code: '8310-5',  display: 'Body temperature',     unit: '°C',        ucum: 'Cel' },
  respiratoryRate:  { code: '9279-1',  display: 'Respiratory rate',     unit: 'breaths/min', ucum: '/min' },
  oxygenSaturation: { code: '59408-5', display: 'Oxygen saturation',    unit: '%',         ucum: '%' },
  weight:           { code: '29463-7', display: 'Body weight',          unit: 'kg',        ucum: 'kg' },
  height:           { code: '8302-2',  display: 'Body height',          unit: 'cm',        ucum: 'cm' },
};

// ─── Mappers ───────────────────────────────────────────────────────────────

export function mapPatient(patient: Record<string, any>): FhirPatient {
  const resource: FhirPatient = {
    resourceType: 'Patient',
    id: String(patient._id ?? patient.systemId),
    identifier: [{ system: 'urn:health-watchers:patient', value: patient.systemId }],
    name: [{ use: 'official', family: patient.lastName, given: [patient.firstName] }],
    gender: toFhirGender(patient.sex),
  };

  if (patient.dateOfBirth) {
    const d = new Date(patient.dateOfBirth);
    if (!isNaN(d.getTime())) resource.birthDate = d.toISOString().split('T')[0];
  }

  if (patient.contactNumber) {
    resource.telecom = [{ system: 'phone', value: patient.contactNumber, use: 'home' }];
  }

  if (patient.address) {
    resource.address = [{ text: patient.address }];
  }

  return resource;
}

export function mapEncounter(enc: Record<string, any>, patientFhirId: string): FhirEncounter {
  const encId = String(enc._id);
  const resource: FhirEncounter = {
    resourceType: 'Encounter',
    id: encId,
    status: toFhirEncounterStatus(enc.status),
    class: { system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode', code: 'AMB', display: 'ambulatory' },
    subject: { reference: `Patient/${patientFhirId}` },
  };

  if (enc.chiefComplaint) {
    resource.reasonCode = [{ text: enc.chiefComplaint }];
  }

  if (enc.createdAt) {
    resource.period = { start: new Date(enc.createdAt).toISOString() };
  }

  return resource;
}

export function mapConditions(enc: Record<string, any>, patientFhirId: string): FhirCondition[] {
  if (!enc.diagnosis?.length) return [];
  const encId = String(enc._id);

  return (enc.diagnosis as Diagnosis[]).map((dx, i) => ({
    resourceType: 'Condition',
    id: `${encId}-condition-${i}`,
    subject: { reference: `Patient/${patientFhirId}` },
    encounter: { reference: `Encounter/${encId}` },
    code: {
      coding: [{ system: 'http://hl7.org/fhir/sid/icd-10', code: dx.code, display: dx.description }],
      text: dx.description,
    },
    clinicalStatus: {
      coding: [{ system: 'http://terminology.hl7.org/CodeSystem/condition-clinical', code: 'active' }],
    },
    category: [{
      coding: [{ system: 'http://terminology.hl7.org/CodeSystem/condition-category', code: 'encounter-diagnosis' }],
    }],
  }));
}

export function mapObservations(enc: Record<string, any>, patientFhirId: string): FhirObservation[] {
  const vitals: VitalSigns = enc.vitalSigns ?? {};
  const encId = String(enc._id);
  const observations: FhirObservation[] = [];

  // Blood pressure is a panel (component-based)
  if (vitals.bloodPressure) {
    const parts = vitals.bloodPressure.split('/');
    const systolic = parseFloat(parts[0]);
    const diastolic = parseFloat(parts[1]);

    const obs: FhirObservation = {
      resourceType: 'Observation',
      id: `${encId}-bp`,
      status: 'final',
      category: [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/observation-category', code: 'vital-signs' }] }],
      code: { coding: [{ system: 'http://loinc.org', code: '55284-4', display: 'Blood pressure systolic and diastolic' }] },
      subject: { reference: `Patient/${patientFhirId}` },
      encounter: { reference: `Encounter/${encId}` },
      component: [],
    };

    if (!isNaN(systolic)) {
      obs.component!.push({
        code: { coding: [{ system: 'http://loinc.org', code: '8480-6', display: 'Systolic blood pressure' }] },
        valueQuantity: { value: systolic, unit: 'mmHg', system: 'http://unitsofmeasure.org', code: 'mm[Hg]' },
      });
    }
    if (!isNaN(diastolic)) {
      obs.component!.push({
        code: { coding: [{ system: 'http://loinc.org', code: '8462-4', display: 'Diastolic blood pressure' }] },
        valueQuantity: { value: diastolic, unit: 'mmHg', system: 'http://unitsofmeasure.org', code: 'mm[Hg]' },
      });
    }

    observations.push(obs);
  }

  // Scalar vitals
  for (const [key, meta] of Object.entries(VITAL_LOINC)) {
    const value = (vitals as any)[key];
    if (value == null) continue;

    observations.push({
      resourceType: 'Observation',
      id: `${encId}-${key}`,
      status: 'final',
      category: [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/observation-category', code: 'vital-signs' }] }],
      code: { coding: [{ system: 'http://loinc.org', code: meta.code, display: meta.display }] },
      subject: { reference: `Patient/${patientFhirId}` },
      encounter: { reference: `Encounter/${encId}` },
      valueQuantity: { value, unit: meta.unit, system: 'http://unitsofmeasure.org', code: meta.ucum },
    });
  }

  return observations;
}

export function mapMedicationRequests(enc: Record<string, any>, patientFhirId: string): FhirMedicationRequest[] {
  if (!enc.prescriptions?.length) return [];
  const encId = String(enc._id);

  return (enc.prescriptions as Prescription[]).map((rx, i) => {
    const resource: FhirMedicationRequest = {
      resourceType: 'MedicationRequest',
      id: `${encId}-rx-${i}`,
      status: 'active',
      intent: 'order',
      medicationCodeableConcept: {
        text: rx.genericName ? `${rx.drugName} (${rx.genericName})` : rx.drugName,
      },
      subject: { reference: `Patient/${patientFhirId}` },
      encounter: { reference: `Encounter/${encId}` },
      dosageInstruction: [{
        text: `${rx.dosage} ${rx.frequency} for ${rx.duration}`,
        route: toFhirRoute(rx.route),
      }],
      dispenseRequest: { numberOfRepeatsAllowed: rx.refillsAllowed ?? 0 },
    };

    if (rx.prescribedAt) {
      resource.authoredOn = new Date(rx.prescribedAt).toISOString();
    }

    return resource;
  });
}

// ─── Bundle builder ────────────────────────────────────────────────────────

export function buildFhirBundle(
  patient: Record<string, any>,
  encounters: Record<string, any>[]
): FhirBundle {
  const patientResource = mapPatient(patient);
  const patientFhirId = patientResource.id;
  const entries: FhirResource[] = [patientResource];

  for (const enc of encounters) {
    entries.push(mapEncounter(enc, patientFhirId));
    entries.push(...mapConditions(enc, patientFhirId));
    entries.push(...mapObservations(enc, patientFhirId));
    entries.push(...mapMedicationRequests(enc, patientFhirId));
  }

  return {
    resourceType: 'Bundle',
    type: 'collection',
    timestamp: new Date().toISOString(),
    entry: entries.map((resource) => ({ resource })),
  };
}
