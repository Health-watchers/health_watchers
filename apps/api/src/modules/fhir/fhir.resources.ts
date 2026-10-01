/**
 * FHIR R4 resource builders for the read API (#1435).
 *
 * Patient / Encounter / Observation reuse the export mappers in
 * `export/fhir-mapper.ts`; this module adds what a queryable server needs on
 * top: vital-signs Observation category + blood-pressure components, search
 * Bundles with paging links, OperationOutcome errors and the
 * CapabilityStatement.
 */
import crypto from 'crypto';
import {
  mapEncounter,
  mapObservations,
  mapPatient,
  FhirEncounter,
  FhirObservation,
  FhirPatient,
} from '../export/fhir-mapper';

export const FHIR_VERSION = '4.0.1';
export const FHIR_JSON = 'application/fhir+json';
export const PATIENT_IDENTIFIER_SYSTEM = 'https://healthwatchers.com/patient-id';

const LOINC = 'http://loinc.org';
const UCUM = 'http://unitsofmeasure.org';
const OBSERVATION_CATEGORY = 'http://terminology.hl7.org/CodeSystem/observation-category';

export const VITAL_SIGNS_CATEGORY = [
  {
    coding: [{ system: OBSERVATION_CATEGORY, code: 'vital-signs', display: 'Vital Signs' }],
    text: 'Vital Signs',
  },
];

export interface VitalSignsObservation extends Omit<FhirObservation, 'valueString'> {
  category: typeof VITAL_SIGNS_CATEGORY;
  component?: {
    code: { coding: { system: string; code: string; display: string }[] };
    valueQuantity: { value: number; unit: string; system: string; code: string };
  }[];
  valueString?: string;
}

export type FhirReadResource = FhirPatient | FhirEncounter | VitalSignsObservation;

export function toFhirPatient(doc: any): FhirPatient {
  return mapPatient(doc);
}

export function toFhirEncounter(doc: any): FhirEncounter {
  return mapEncounter(doc, String(doc.patientId));
}

/**
 * Vital-sign Observations for one encounter, shaped to the R4 vital-signs
 * profile: category `vital-signs`, and blood pressure as systolic/diastolic
 * components (LOINC 85354-9) instead of a free-text value. A blood pressure
 * that is not `<systolic>/<diastolic>` cannot satisfy the profile and is left out.
 */
export function toVitalSignsObservations(encounter: any): VitalSignsObservation[] {
  return mapObservations(encounter, String(encounter.patientId)).flatMap((obs) => {
    const withCategory: VitalSignsObservation = { ...obs, category: VITAL_SIGNS_CATEGORY };
    if (obs.code.coding[0]?.code !== '55284-4') return [withCategory];

    const match = /^\s*(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)\s*$/.exec(obs.valueString ?? '');
    if (!match) return [];
    const { valueString: _raw, ...rest } = withCategory;
    const bp: VitalSignsObservation = {
      ...rest,
      code: {
        coding: [
          {
            system: LOINC,
            code: '85354-9',
            display: 'Blood pressure panel with all children optional',
          },
        ],
      },
    };
    const quantity = (
      value: string
    ): { value: number; unit: string; system: string; code: string } => ({
      value: Number(value),
      unit: 'mmHg',
      system: UCUM,
      code: 'mm[Hg]',
    });
    bp.component = [
      {
        code: { coding: [{ system: LOINC, code: '8480-6', display: 'Systolic blood pressure' }] },
        valueQuantity: quantity(match[1]),
      },
      {
        code: { coding: [{ system: LOINC, code: '8462-4', display: 'Diastolic blood pressure' }] },
        valueQuantity: quantity(match[2]),
      },
    ];
    return [bp];
  });
}

// ── Bundle ────────────────────────────────────────────────────────────────────

export interface SearchBundle {
  resourceType: 'Bundle';
  id: string;
  meta: { lastUpdated: string };
  type: 'searchset';
  total?: number;
  link: { relation: 'self' | 'next'; url: string }[];
  /** Omitted when there are no matches — FHIR does not allow empty arrays. */
  entry?: { fullUrl: string; resource: FhirReadResource; search: { mode: 'match' } }[];
}

export function searchBundle(opts: {
  baseUrl: string;
  selfUrl: string;
  nextUrl?: string | null;
  resources: FhirReadResource[];
  total?: number;
}): SearchBundle {
  const link: SearchBundle['link'] = [{ relation: 'self', url: opts.selfUrl }];
  if (opts.nextUrl) link.push({ relation: 'next', url: opts.nextUrl });
  return {
    resourceType: 'Bundle',
    id: crypto.randomUUID(),
    meta: { lastUpdated: new Date().toISOString() },
    type: 'searchset',
    ...(opts.total !== undefined ? { total: opts.total } : {}),
    link,
    ...(opts.resources.length
      ? {
          entry: opts.resources.map((resource) => ({
            fullUrl: `${opts.baseUrl}/${resource.resourceType}/${resource.id}`,
            resource,
            search: { mode: 'match' as const },
          })),
        }
      : {}),
  };
}

// ── OperationOutcome ──────────────────────────────────────────────────────────

export type IssueCode =
  | 'not-found'
  | 'invalid'
  | 'login'
  | 'forbidden'
  | 'not-supported'
  | 'exception'
  | 'throttled';

export interface OperationOutcome {
  resourceType: 'OperationOutcome';
  issue: { severity: 'fatal' | 'error'; code: IssueCode; diagnostics: string }[];
}

export function operationOutcome(code: IssueCode, diagnostics: string): OperationOutcome {
  return {
    resourceType: 'OperationOutcome',
    issue: [{ severity: code === 'exception' ? 'fatal' : 'error', code, diagnostics }],
  };
}

// ── CapabilityStatement ───────────────────────────────────────────────────────

export function capabilityStatement(
  baseUrl: string
): { resourceType: 'CapabilityStatement'; fhirVersion: string } & Record<string, unknown> {
  const countParam = {
    name: '_count',
    type: 'number' as const,
    documentation: 'Page size (1–100, default 20)',
  };
  const cursorParam = {
    name: '_cursor',
    type: 'string' as const,
    documentation: 'Opaque paging cursor — follow Bundle.link[next] instead of building it',
  };
  return {
    resourceType: 'CapabilityStatement' as const,
    id: 'health-watchers-fhir-r4',
    url: `${baseUrl}/metadata`,
    name: 'HealthWatchersFhirR4',
    title: 'Health Watchers FHIR R4 read API',
    status: 'active' as const,
    experimental: false,
    date: '2026-09-29',
    publisher: 'Health Watchers',
    description:
      'Read-only FHIR R4 access to patients, encounters and vital-sign observations, scoped to the clinic that owns the API key.',
    kind: 'instance' as const,
    software: { name: 'Health Watchers API' },
    implementation: { description: 'Health Watchers FHIR R4 endpoint', url: baseUrl },
    fhirVersion: FHIR_VERSION,
    format: [FHIR_JSON, 'json'],
    rest: [
      {
        mode: 'server' as const,
        documentation: 'All resource endpoints require a clinic API key.',
        security: {
          cors: true,
          description:
            'Send `Authorization: Bearer hw_…` (or `ApiKey hw_…`) with a clinic API key. Keys need `patient/*.read` or the per-resource scope (`patient/Patient.read`, `patient/Encounter.read`, `patient/Observation.read`). All access is audit-logged.',
        },
        resource: [
          {
            type: 'Patient',
            profile: 'http://hl7.org/fhir/StructureDefinition/Patient',
            interaction: [{ code: 'read' as const }, { code: 'search-type' as const }],
            searchParam: [
              {
                name: 'identifier',
                definition: 'http://hl7.org/fhir/SearchParameter/Patient-identifier',
                type: 'token' as const,
                documentation: `Clinic patient number; system ${PATIENT_IDENTIFIER_SYSTEM}`,
              },
              countParam,
              cursorParam,
            ],
          },
          {
            type: 'Encounter',
            profile: 'http://hl7.org/fhir/StructureDefinition/Encounter',
            interaction: [{ code: 'search-type' as const }],
            searchParam: [
              {
                name: 'patient',
                definition: 'http://hl7.org/fhir/SearchParameter/clinical-patient',
                type: 'reference' as const,
                documentation: 'Required. A patient id, optionally prefixed with `Patient/`',
              },
              countParam,
              cursorParam,
            ],
          },
          {
            type: 'Observation',
            profile: 'http://hl7.org/fhir/StructureDefinition/vitalsigns',
            interaction: [{ code: 'search-type' as const }],
            searchParam: [
              {
                name: 'patient',
                definition: 'http://hl7.org/fhir/SearchParameter/clinical-patient',
                type: 'reference' as const,
                documentation: 'Required. A patient id, optionally prefixed with `Patient/`',
              },
              {
                name: 'category',
                definition: 'http://hl7.org/fhir/SearchParameter/Observation-category',
                type: 'token' as const,
                documentation: 'Only `vital-signs` is available',
              },
              {
                name: '_count',
                type: 'number' as const,
                documentation:
                  'Encounters per page (1–100, default 20); each contributes its vital signs',
              },
              cursorParam,
            ],
          },
        ],
      },
    ],
  };
}
