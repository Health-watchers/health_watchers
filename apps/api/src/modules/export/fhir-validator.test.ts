import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  validateFhirResource,
  validateFhirResources,
  validateFhirBundle,
  isSupportedResourceType,
  SUPPORTED_RESOURCE_TYPES,
} from './fhir-validator';

describe('fhir-validator', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  describe('isSupportedResourceType', () => {
    it('returns true for all supported resource types', () => {
      for (const type of SUPPORTED_RESOURCE_TYPES) {
        expect(isSupportedResourceType(type)).toBe(true);
      }
    });

    it('returns false for unsupported resource types', () => {
      expect(isSupportedResourceType('DiagnosticReport')).toBe(false);
      expect(isSupportedResourceType('')).toBe(false);
    });

    it('supports the required resource types', () => {
      expect(SUPPORTED_RESOURCE_TYPES).toEqual(
        expect.arrayContaining([
          'Patient',
          'Observation',
          'Encounter',
          'MedicationRequest',
          'Immunization',
        ]),
      );
    });
  });

  describe('Patient', () => {
    const validPatient = {
      resourceType: 'Patient',
      id: 'patient-1',
      active: true,
      name: [{ family: 'Doe', given: ['John'] }],
      gender: 'male',
      birthDate: '1980-01-01',
    };

    it('accepts a valid Patient', () => {
      const result = validateFhirResource(validPatient);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });

    it('rejects a Patient with an invalid gender', () => {
      const result = validateFhirResource({ ...validPatient, gender: 'unknown-gender' });
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(consoleErrorSpy).toHaveBeenCalled();
    });

    it('rejects a Patient with an invalid birthDate', () => {
      const result = validateFhirResource({ ...validPatient, birthDate: 'not-a-date' });
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('rejects a Patient missing resourceType', () => {
      const { resourceType, ...rest } = validPatient;
      const result = validateFhirResource(rest);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  describe('Observation', () => {
    const validObservation = {
      resourceType: 'Observation',
      id: 'obs-1',
      status: 'final',
      code: {
        coding: [
          {
            system: 'http://loinc.org',
            code: '8867-4',
            display: 'Heart rate',
          },
        ],
      },
      subject: { reference: 'Patient/patient-1' },
      effectiveDateTime: '2024-01-01T10:00:00Z',
      valueQuantity: { value: 72, unit: 'beats/min', system: 'http://unitsofmeasure.org', code: '/min' },
    };

    it('accepts a valid Observation', () => {
      const result = validateFhirResource(validObservation);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('rejects an Observation with an invalid status', () => {
      const result = validateFhirResource({ ...validObservation, status: 'bogus' });
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(consoleErrorSpy).toHaveBeenCalled();
    });

    it('rejects an Observation missing code', () => {
      const { code, ...rest } = validObservation;
      const result = validateFhirResource(rest);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  describe('Encounter', () => {
    const validEncounter = {
      resourceType: 'Encounter',
      id: 'enc-1',
      status: 'finished',
      class: {
        system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode',
        code: 'AMB',
        display: 'ambulatory',
      },
      subject: { reference: 'Patient/patient-1' },
      period: { start: '2024-01-01T09:00:00Z', end: '2024-01-01T10:00:00Z' },
    };

    it('accepts a valid Encounter', () => {
      const result = validateFhirResource(validEncounter);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('rejects an Encounter with an invalid status', () => {
      const result = validateFhirResource({ ...validEncounter, status: 'nope' });
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(consoleErrorSpy).toHaveBeenCalled();
    });

    it('rejects an Encounter missing class', () => {
      const { class: _class, ...rest } = validEncounter;
      const result = validateFhirResource(rest);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  describe('MedicationRequest', () => {
    const validMedicationRequest = {
      resourceType: 'MedicationRequest',
      id: 'med-1',
      status: 'active',
      intent: 'order',
      medicationCodeableConcept: {
        coding: [
          {
            system: 'http://www.nlm.nih.gov/research/umls/rxnorm',
            code: '197361',
            display: 'Amlodipine 5 MG Oral Tablet',
          },
        ],
      },
      subject: { reference: 'Patient/patient-1' },
      authoredOn: '2024-01-01T10:00:00Z',
    };

    it('accepts a valid MedicationRequest', () => {
      const result = validateFhirResource(validMedicationRequest);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('rejects a MedicationRequest with an invalid intent', () => {
      const result = validateFhirResource({ ...validMedicationRequest, intent: 'bogus' });
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(consoleErrorSpy).toHaveBeenCalled();
    });

    it('rejects a MedicationRequest missing status', () => {
      const { status, ...rest } = validMedicationRequest;
      const result = validateFhirResource(rest);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  describe('Immunization', () => {
    const validImmunization = {
      resourceType: 'Immunization',
      id: 'imm-1',
      status: 'completed',
      vaccineCode: {
        coding: [
          {
            system: 'http://hl7.org/fhir/sid/cvx',
            code: '140',
            display: 'Influenza, seasonal, injectable',
          },
        ],
      },
      patient: { reference: 'Patient/patient-1' },
      occurrenceDateTime: '2024-01-01T10:00:00Z',
    };

    it('accepts a valid Immunization', () => {
      const result = validateFhirResource(validImmunization);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('rejects an Immunization with an invalid status', () => {
      const result = validateFhirResource({ ...validImmunization, status: 'bogus' });
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(consoleErrorSpy).toHaveBeenCalled();
    });

    it('rejects an Immunization missing vaccineCode', () => {
      const { vaccineCode, ...rest } = validImmunization;
      const result = validateFhirResource(rest);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  describe('validateFhirResources', () => {
    it('validates a collection and reports per-resource results', () => {
      const resources = [
        { resourceType: 'Patient', id: 'p1', gender: 'female' },
        { resourceType: 'Observation', id: 'o1', status: 'final', code: { text: 'x' } },
        { resourceType: 'Observation', id: 'o2', status: 'invalid-status', code: { text: 'x' } },
      ];

      const results = validateFhirResources(resources);
      expect(results).toHaveLength(3);
      expect(results[0].valid).toBe(true);
      expect(results[1].valid).toBe(true);
      expect(results[2].valid).toBe(false);
      expect(consoleErrorSpy).toHaveBeenCalled();
    });

    it('flags unsupported resource types as invalid', () => {
      const results = validateFhirResources([{ resourceType: 'DiagnosticReport', id: 'd1' }]);
      expect(results).toHaveLength(1);
      expect(results[0].valid).toBe(false);
      expect(results[0].errors.length).toBeGreaterThan(0);
    });
  });

  describe('validateFhirBundle', () => {
    it('accepts a valid collection bundle', () => {
      const bundle = {
        resourceType: 'Bundle',
        type: 'collection',
        entry: [
          { resource: { resourceType: 'Patient', id: 'p1', gender: 'male' } },
          {
            resource: {
              resourceType: 'Immunization',
              id: 'i1',
              status: 'completed',
              vaccineCode: { text: 'flu' },
              patient: { reference: 'Patient/p1' },
            },
          },
        ],
      };

      const result = validateFhirBundle(bundle);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('rejects a bundle containing an invalid resource', () => {
      const bundle = {
        resourceType: 'Bundle',
        type: 'collection',
        entry: [
          { resource: { resourceType: 'Patient', id: 'p1', gender: 'not-a-gender' } },
        ],
      };

      const result = validateFhirBundle(bundle);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(consoleErrorSpy).toHaveBeenCalled();
    });

    it('rejects a bundle with an invalid type', () => {
      const result = validateFhirBundle({ resourceType: 'Bundle', type: 'bogus', entry: [] });
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  describe('error logging', () => {
    it('logs validation errors without throwing', () => {
      expect(() =>
        validateFhirResource({ resourceType: 'Patient', id: 'p1', gender: 'bad' }),
      ).not.toThrow();
      expect(consoleErrorSpy).toHaveBeenCalled();
    });

    it('does not log when validation succeeds', () => {
      validateFhirResource({ resourceType: 'Patient', id: 'p1', gender: 'male' });
      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });
  });
});