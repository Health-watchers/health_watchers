/**
 * FHIR R4 resource mappers for patient data export (Issue #598).
 * Maps internal models to FHIR R4 resources per HL7 spec.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export interface FhirPatient {
  resourceType: 'Patient';
  id: string;
  identifier: { system: string; value: string }[];
  name: { family: string; given: string[] }[];
  gender: 'male' | 'female' | 'other' | 'unknown';
  birthDate?: string;
  telecom?: { system: string; value: string }[];
  address?: { text: string }[];
  active: boolean;
}

export interface FhirEncounter {
  resourceType: 'Encounter';
  id: string;
  status: 'finished' | 'in-progress' | 'cancelled' | 'unknown';
  class: { system: string; code: string };
  subject: { reference: string };
  reasonCode?: { text: string }[];
  period?: { start: string };
}

export interface FhirCondition {
  resourceType: 'Condition';
  id: string;
  subject: { reference: string };
  encounter: { reference: string };
  code: { coding: { system: string; code: string; display: string }[]; text: string };
}

export interface FhirObservation {
  resourceType: 'Observation';
  id: string;
  status: 'final';
  code: { coding: { system: string; code: string; display: string }[] };
  subject: { reference: string };
  encounter: { reference: string };
  valueQuantity?: { value: number; unit: string; system: string; code: string };
  valueString?: string;
  effectiveDateTime?: string;
}

export interface FhirMedicationRequest {
  resourceType: 'MedicationRequest';
  id: string;
  status: 'active' | 'completed' | 'unknown';
  intent: 'order';
  subject: { reference: string };
  encounter: { reference: string };
  medicationCodeableConcept: { text: string };
  dosageInstruction: { text: string; route?: { text: string } }[];
  authoredOn?: string;
}

export interface FhirCoverage {
  resourceType: 'Coverage';
  id: string;
  status: 'active' | 'cancelled' | 'draft' | 'entered-in-error';
  beneficiary: { reference: string };
  payor: { display: string }[];
  subscriberId?: string;
  grouping?: { group?: string };
  type?: { coding: { system: string; code: string; display: string }[] };
  period?: { start?: string; end?: string };
  order?: number;
}

export type FhirResource = FhirPatient | FhirEncounter | FhirCondition | FhirObservation | FhirMedicationRequest | FhirCoverage;

export interface FhirBundle {
  resourceType: 'Bundle';
  type: 'collection';
  total: number;
  entry: { resource: FhirResource }[];
}

// ── Sex mapping ───────────────────────────────────────────────────────────────

function toFhirGender(sex: string): FhirPatient['gender'] {
  if (sex === 'M') return 'male';
  if (sex === 'F') return 'female';
  return 'other';
}

// ── Encounter status mapping ──────────────────────────────────────────────────

function toFhirEncounterStatus(status: string): FhirEncounter['status'] {
  if (status === 'closed') return 'finished';
  if (status === 'cancelled') return 'cancelled';
  if (status === 'open' || status === 'follow-up' || status === 'pending_cosignature') return 'in-progress';
  return 'unknown';
}

// ── Mappers ───────────────────────────────────────────────────────────────────

export function mapPatient(p: any): FhirPatient {
  const resource: FhirPatient = {
    resourceType: 'Patient',
    id: String(p._id),
    identifier: [{ system: 'https://healthwatchers.com/patient-id', value: p.systemId }],
    name: [{ family: p.lastName, given: [p.firstName] }],
    gender: toFhirGender(p.sex),
    active: p.isActive ?? true,
  };
  if (p.dateOfBirth) resource.birthDate = p.dateOfBirth.slice(0, 10);
  if (p.contactNumber) resource.telecom = [{ system: 'phone', value: p.contactNumber }];
  if (p.address) resource.address = [{ text: p.address }];
  return resource;
}

export function mapEncounter(enc: any, patientId: string): FhirEncounter {
  return {
    resourceType: 'Encounter',
    id: String(enc._id),
    status: toFhirEncounterStatus(enc.status),
    class: { system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode', code: enc.type === 'telemedicine' ? 'VR' : 'AMB' },
    subject: { reference: `Patient/${patientId}` },
    ...(enc.chiefComplaint ? { reasonCode: [{ text: enc.chiefComplaint }] } : {}),
    ...(enc.createdAt ? { period: { start: new Date(enc.createdAt).toISOString() } } : {}),
  };
}

export function mapConditions(enc: any, patientId: string): FhirCondition[] {
  if (!enc.diagnosis?.length) return [];
  return enc.diagnosis.map((d: any, i: number) => ({
    resourceType: 'Condition' as const,
    id: `${String(enc._id)}-cond-${i}`,
    subject: { reference: `Patient/${patientId}` },
    encounter: { reference: `Encounter/${String(enc._id)}` },
    code: {
      coding: [{ system: 'http://hl7.org/fhir/sid/icd-10', code: d.code, display: d.description }],
      text: d.description,
    },
  }));
}

const VITAL_MAP: Record<string, { code: string; display: string; unit: string; ucum: string }> = {
  heartRate:         { code: '8867-4',  display: 'Heart rate',           unit: '/min',  ucum: '/min' },
  temperature:       { code: '8310-5',  display: 'Body temperature',     unit: 'Cel',   ucum: 'Cel' },
  respiratoryRate:   { code: '9279-1',  display: 'Respiratory rate',     unit: '/min',  ucum: '/min' },
  oxygenSaturation:  { code: '2708-6',  display: 'Oxygen saturation',    unit: '%',     ucum: '%' },
  weight:            { code: '29463-7', display: 'Body weight',          unit: 'kg',    ucum: 'kg' },
  height:            { code: '8302-2',  display: 'Body height',          unit: 'cm',    ucum: 'cm' },
};

export function mapObservations(enc: any, patientId: string): FhirObservation[] {
  const obs: FhirObservation[] = [];
  const vs = enc.vitalSigns;
  if (!vs) return obs;

  for (const [field, meta] of Object.entries(VITAL_MAP)) {
    const val = vs[field];
    if (val == null) continue;
    obs.push({
      resourceType: 'Observation',
      id: `${String(enc._id)}-obs-${field}`,
      status: 'final',
      code: { coding: [{ system: 'http://loinc.org', code: meta.code, display: meta.display }] },
      subject: { reference: `Patient/${patientId}` },
      encounter: { reference: `Encounter/${String(enc._id)}` },
      valueQuantity: { value: val, unit: meta.unit, system: 'http://unitsofmeasure.org', code: meta.ucum },
      ...(enc.createdAt ? { effectiveDateTime: new Date(enc.createdAt).toISOString() } : {}),
    });
  }

  if (vs.bloodPressure) {
    obs.push({
      resourceType: 'Observation',
      id: `${String(enc._id)}-obs-bp`,
      status: 'final',
      code: { coding: [{ system: 'http://loinc.org', code: '55284-4', display: 'Blood pressure' }] },
      subject: { reference: `Patient/${patientId}` },
      encounter: { reference: `Encounter/${String(enc._id)}` },
      valueString: vs.bloodPressure,
      ...(enc.createdAt ? { effectiveDateTime: new Date(enc.createdAt).toISOString() } : {}),
    });
  }

  return obs;
}

export function mapMedicationRequests(enc: any, patientId: string): FhirMedicationRequest[] {
  if (!enc.prescriptions?.length) return [];
  return enc.prescriptions.map((rx: any, i: number) => ({
    resourceType: 'MedicationRequest' as const,
    id: `${String(enc._id)}-rx-${i}`,
    status: 'active' as const,
    intent: 'order' as const,
    subject: { reference: `Patient/${patientId}` },
    encounter: { reference: `Encounter/${String(enc._id)}` },
    medicationCodeableConcept: { text: rx.genericName ? `${rx.drugName} (${rx.genericName})` : rx.drugName },
    dosageInstruction: [{
      text: `${rx.dosage} ${rx.frequency} for ${rx.duration}${rx.instructions ? ' — ' + rx.instructions : ''}`,
      ...(rx.route ? { route: { text: rx.route } } : {}),
    }],
    ...(rx.prescribedAt ? { authoredOn: new Date(rx.prescribedAt).toISOString() } : {}),
  }));
}

// ── Bundle builder ────────────────────────────────────────────────────────────

/**
 * Maps patient insurance records to FHIR R4 Coverage resources.
 * policyNumber maps to subscriberId; groupNumber maps to grouping.group.
 */
export function mapCoverage(patient: any): FhirCoverage[] {
  if (!patient.insurance?.length) return [];

  // Coverage type → FHIR ActCode mapping (http://terminology.hl7.org/CodeSystem/v3-ActCode)
  const COVERAGE_TYPE_MAP: Record<string, { code: string; display: string }> = {
    HMO:      { code: 'HMO',      display: 'Health Maintenance Organization' },
    PPO:      { code: 'PPO',      display: 'Preferred Provider Organization' },
    EPO:      { code: 'EPO',      display: 'Exclusive Provider Organization' },
    POS:      { code: 'POS',      display: 'Point of Service' },
    HDHP:     { code: 'HDHP',     display: 'High Deductible Health Plan' },
    Medicare: { code: 'RETIRE',   display: 'Retiree Health Program' },
    Medicaid: { code: 'PUBLICPOL', display: 'Public Healthcare' },
    other:    { code: 'pay',      display: 'Payer' },
  };

  const patientId = String(patient._id);

  return (patient.insurance as any[]).map((ins: any, i: number) => {
    const typeInfo = COVERAGE_TYPE_MAP[ins.coverageType] ?? COVERAGE_TYPE_MAP.other;
    const resource: FhirCoverage = {
      resourceType: 'Coverage',
      id: `${patientId}-cov-${i}`,
      status: 'active',
      beneficiary: { reference: `Patient/${patientId}` },
      payor: [{ display: ins.provider }],
      order: ins.isPrimary ? 1 : i + 2,
      type: {
        coding: [
          {
            system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode',
            code: typeInfo.code,
            display: typeInfo.display,
          },
        ],
      },
    };

    if (ins.policyNumber) resource.subscriberId = ins.policyNumber;
    if (ins.groupNumber) resource.grouping = { group: ins.groupNumber };
    if (ins.effectiveDate || ins.expirationDate) {
      resource.period = {};
      if (ins.effectiveDate) resource.period.start = ins.effectiveDate.slice(0, 10);
      if (ins.expirationDate) resource.period.end = ins.expirationDate.slice(0, 10);
    }

    return resource;
  });
}

export function buildFhirBundle(patient: any, encounters: any[]): FhirBundle {
  const patientId = String(patient._id);
  const resources: FhirResource[] = [mapPatient(patient)];

  // Include Coverage resources for insurance records
  resources.push(...mapCoverage(patient));

  for (const enc of encounters) {
    resources.push(mapEncounter(enc, patientId));
    resources.push(...mapConditions(enc, patientId));
    resources.push(...mapObservations(enc, patientId));
    resources.push(...mapMedicationRequests(enc, patientId));
  }

  return {
    resourceType: 'Bundle',
    type: 'collection',
    total: resources.length,
    entry: resources.map((r) => ({ resource: r })),
  };
}
