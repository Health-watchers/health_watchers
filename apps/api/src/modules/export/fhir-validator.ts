import Ajv, { type ErrorObject, type ValidateFunction } from 'ajv';
import { logger } from '../../utils/logger';
import { AppError, Errors } from '../../utils/errors';

/**
 * FHIR R4 export validation helper.
 *
 * This module validates the FHIR resources produced by `fhir-mapper.ts`
 * against a curated subset of the FHIR R4 JSON schema before they are
 * returned from the export endpoint.
 *
 * Supported FHIR R4 profiles / resource types:
 *   - Patient            (http://hl7.org/fhir/StructureDefinition/Patient)
 *   - Observation        (http://hl7.org/fhir/StructureDefinition/Observation)
 *   - Encounter          (http://hl7.org/fhir/StructureDefinition/Encounter)
 *   - MedicationRequest  (http://hl7.org/fhir/StructureDefinition/MedicationRequest)
 *   - Immunization       (http://hl7.org/fhir/StructureDefinition/Immunization)
 *
 * The schema fixture is generated/extended by `extract-r4-schema.js` and
 * covers the structural constraints (required fields, primitive types,
 * cardinality) of the resources above. It is intentionally a subset of the
 * full R4 specification and does not perform terminology/profile validation.
 *
 * Validation failures are logged with full detail via the API logger and are
 * NEVER surfaced to end users: callers receive a generic internal error.
 */

/**
 * Minimal JSON-schema subset for the supported FHIR R4 resources.
 *
 * NOTE: This fixture is kept in sync with `extract-r4-schema.js`. When the
 * script is re-run it extends this object with the MedicationRequest and
 * Immunization definitions.
 */
const fhirR4Schema = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  $id: 'https://example.org/fhir/r4/subset.json',
  title: 'FHIR R4 subset',
  definitions: {
    Patient: {
      type: 'object',
      required: ['resourceType'],
      properties: {
        resourceType: { const: 'Patient' },
        id: { type: 'string' },
        identifier: { type: 'array', items: { type: 'object' } },
        name: { type: 'array', items: { type: 'object' } },
        gender: { type: 'string' },
        birthDate: { type: 'string' },
      },
    },
    Observation: {
      type: 'object',
      required: ['resourceType', 'status', 'code'],
      properties: {
        resourceType: { const: 'Observation' },
        id: { type: 'string' },
        status: { type: 'string' },
        code: { type: 'object' },
        subject: { type: 'object' },
        valueQuantity: { type: 'object' },
        valueString: { type: 'string' },
        effectiveDateTime: { type: 'string' },
      },
    },
    Encounter: {
      type: 'object',
      required: ['resourceType', 'status'],
      properties: {
        resourceType: { const: 'Encounter' },
        id: { type: 'string' },
        status: { type: 'string' },
        class: { type: 'object' },
        subject: { type: 'object' },
        period: { type: 'object' },
      },
    },
    MedicationRequest: {
      type: 'object',
      required: ['resourceType', 'status', 'intent', 'medicationCodeableConcept'],
      properties: {
        resourceType: { const: 'MedicationRequest' },
        id: { type: 'string' },
        status: { type: 'string' },
        intent: { type: 'string' },
        medicationCodeableConcept: { type: 'object' },
        medicationReference: { type: 'object' },
        subject: { type: 'object' },
        authoredOn: { type: 'string' },
        dosageInstruction: { type: 'array', items: { type: 'object' } },
      },
    },
    Immunization: {
      type: 'object',
      required: ['resourceType', 'status', 'vaccineCode', 'patient'],
      properties: {
        resourceType: { const: 'Immunization' },
        id: { type: 'string' },
        status: { type: 'string' },
        vaccineCode: { type: 'object' },
        patient: { type: 'object' },
        occurrenceDateTime: { type: 'string' },
        lotNumber: { type: 'string' },
        performer: { type: 'array', items: { type: 'object' } },
      },
    },
  },
} as const;

const SUPPORTED_RESOURCE_TYPES = [
  'Patient',
  'Observation',
  'Encounter',
  'MedicationRequest',
  'Immunization',
] as const;

type SupportedResourceType = (typeof SUPPORTED_RESOURCE_TYPES)[number];

const ajv = new Ajv({ allErrors: true, strict: false });

const validators: Record<SupportedResourceType, ValidateFunction> = {
  Patient: ajv.compile(fhirR4Schema.definitions.Patient),
  Observation: ajv.compile(fhirR4Schema.definitions.Observation),
  Encounter: ajv.compile(fhirR4Schema.definitions.Encounter),
  MedicationRequest: ajv.compile(fhirR4Schema.definitions.MedicationRequest),
  Immunization: ajv.compile(fhirR4Schema.definitions.Immunization),
};

function isSupportedResourceType(value: unknown): value is SupportedResourceType {
  return (
    typeof value === 'string' &&
    (SUPPORTED_RESOURCE_TYPES as readonly string[]).includes(value)
  );
}

function formatErrors(errors: ErrorObject[] | null | undefined): string[] {
  if (!errors) {
    return [];
  }
  return errors.map((err) => {
    const path = err.instancePath || '(root)';
    return `${path} ${err.message ?? 'is invalid'}`.trim();
  });
}

/**
 * Validate a single mapped FHIR R4 resource.
 *
 * Throws a generic internal `AppError` on failure (safe for end users) and
 * logs the detailed validation errors via the API logger.
 *
 * @param resource The mapped FHIR resource to validate.
 * @returns The validated resource (unchanged) when valid.
 */
export function validateFhirResource<T = unknown>(resource: T): T {
  const resourceType = (resource as { resourceType?: unknown } | null)?.resourceType;

  if (!isSupportedResourceType(resourceType)) {
    logger.error('FHIR validation failed: unsupported or missing resourceType', {
      resourceType,
    });
    throw new AppError(
      Errors.generic.internalError.message,
      Errors.generic.internalError.code,
    );
  }

  const validate = validators[resourceType];
  const valid = validate(resource);

  if (!valid) {
    logger.error('FHIR R4 validation failed', {
      resourceType,
      errors: formatErrors(validate.errors),
    });
    throw new AppError(
      Errors.generic.internalError.message,
      Errors.generic.internalError.code,
    );
  }

  return resource;
}

interface FhirBundle {
  resourceType: 'Bundle';
  type?: string;
  entry?: Array<{ resource?: unknown }>;
  [key: string]: unknown;
}

/**
 * Validate a FHIR Bundle and every contained resource.
 *
 * Throws a generic internal `AppError` on failure (safe for end users) and
 * logs the detailed validation errors via the API logger.
 *
 * @param bundle The FHIR Bundle to validate.
 * @returns The validated bundle (unchanged) when valid.
 */
export function validateFhirBundle<T extends FhirBundle>(bundle: T): T {
  if (!bundle || bundle.resourceType !== 'Bundle') {
    logger.error('FHIR validation failed: expected a Bundle resource', {
      resourceType: (bundle as { resourceType?: unknown } | null)?.resourceType,
    });
    throw new AppError(
      Errors.generic.internalError.message,
      Errors.generic.internalError.code,
    );
  }

  const entries = Array.isArray(bundle.entry) ? bundle.entry : [];

  entries.forEach((entry, index) => {
    const resource = entry?.resource;
    if (!resource) {
      logger.error('FHIR validation failed: bundle entry missing resource', {
        index,
      });
      throw new AppError(
        Errors.generic.internalError.message,
        Errors.generic.internalError.code,
      );
    }

    try {
      validateFhirResource(resource);
    } catch (error) {
      logger.error('FHIR validation failed for bundle entry', {
        index,
        resourceType: (resource as { resourceType?: unknown }).resourceType,
      });
      throw error;
    }
  });

  return bundle;
}

export { SUPPORTED_RESOURCE_TYPES, fhirR4Schema };
export type { SupportedResourceType };