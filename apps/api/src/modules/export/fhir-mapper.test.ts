import {
  mapPatient,
  mapEncounter,
  mapConditions,
  mapObservations,
  mapMedicationRequests,
  buildFhirBundle,
} from '@api/modules/export/fhir-mapper';

// ─── Fixtures ──────────────────────────────────────────────────────────────

const patientId = '507f1f77bcf86cd799439011';

const basePatient = {
  _id: patientId,
  systemId: 'HW-001',
  firstName: 'Jane',
  lastName: 'Doe',
  sex: 'F' as const,
  dateOfBirth: '1990-06-15',
  contactNumber: '+1-555-0100',
  address: '123 Main St, Springfield',
  clinicId: '507f1f77bcf86cd799439012',
};

const encounterId = '507f1f77bcf86cd799439013';

const baseEncounter = {
  _id: encounterId,
  patientId,
  clinicId: '507f1f77bcf86cd799439012',
  chiefComplaint: 'Chest pain',
  status: 'closed' as const,
  createdAt: new Date('2024-03-01T10:00:00Z'),
  diagnosis: [
    { code: 'I10', description: 'Essential hypertension', isPrimary: true },
    { code: 'R07.9', description: 'Chest pain, unspecified', isPrimary: false },
  ],
  vitalSigns: {
    bloodPressure: '130/85',
    heartRate: 78,
    temperature: 37.2,
    respiratoryRate: 16,
    oxygenSaturation: 98,
    weight: 65,
    height: 168,
  },
  prescriptions: [
    {
      drugName: 'Lisinopril',
      genericName: 'lisinopril',
      dosage: '10mg',
      frequency: 'once daily',
      duration: '30 days',
      route: 'oral' as const,
      prescribedBy: '507f1f77bcf86cd799439014',
      prescribedAt: new Date('2024-03-01T11:00:00Z'),
      refillsAllowed: 2,
    },
  ],
};

// ─── mapPatient ────────────────────────────────────────────────────────────

describe('mapPatient', () => {
  it('maps required fields correctly', () => {
    const result = mapPatient(basePatient);
    expect(result.resourceType).toBe('Patient');
    expect(result.id).toBe(patientId);
    expect(result.identifier[0].value).toBe('HW-001');
    expect(result.name[0]).toEqual({ use: 'official', family: 'Doe', given: ['Jane'] });
    expect(result.gender).toBe('female');
    expect(result.birthDate).toBe('1990-06-15');
  });

  it('maps sex M -> male, O -> other', () => {
    expect(mapPatient({ ...basePatient, sex: 'M' }).gender).toBe('male');
    expect(mapPatient({ ...basePatient, sex: 'O' }).gender).toBe('other');
  });

  it('includes telecom when contactNumber present', () => {
    const result = mapPatient(basePatient);
    expect(result.telecom).toEqual([{ system: 'phone', value: '+1-555-0100', use: 'home' }]);
  });

  it('includes address when present', () => {
    const result = mapPatient(basePatient);
    expect(result.address).toEqual([{ text: '123 Main St, Springfield' }]);
  });

  it('omits telecom and address when absent', () => {
    const { contactNumber, address, ...minimal } = basePatient;
    const result = mapPatient(minimal);
    expect(result.telecom).toBeUndefined();
    expect(result.address).toBeUndefined();
  });

  it('omits birthDate for invalid date', () => {
    const result = mapPatient({ ...basePatient, dateOfBirth: 'not-a-date' });
    expect(result.birthDate).toBeUndefined();
  });
});

// ─── mapEncounter ──────────────────────────────────────────────────────────

describe('mapEncounter', () => {
  it('maps required fields', () => {
    const result = mapEncounter(baseEncounter, patientId);
    expect(result.resourceType).toBe('Encounter');
    expect(result.id).toBe(encounterId);
    expect(result.subject.reference).toBe(`Patient/${patientId}`);
  });

  it('maps status correctly', () => {
    expect(mapEncounter({ ...baseEncounter, status: 'closed' }, patientId).status).toBe('finished');
    expect(mapEncounter({ ...baseEncounter, status: 'open' }, patientId).status).toBe('in-progress');
    expect(mapEncounter({ ...baseEncounter, status: 'cancelled' }, patientId).status).toBe('cancelled');
    expect(mapEncounter({ ...baseEncounter, status: 'follow-up' }, patientId).status).toBe('finished');
    expect(mapEncounter({ ...baseEncounter, status: 'pending_cosignature' }, patientId).status).toBe('in-progress');
  });

  it('sets reasonCode from chiefComplaint', () => {
    const result = mapEncounter(baseEncounter, patientId);
    expect(result.reasonCode?.[0].text).toBe('Chest pain');
  });

  it('sets period.start from createdAt', () => {
    const result = mapEncounter(baseEncounter, patientId);
    expect(result.period?.start).toBe('2024-03-01T10:00:00.000Z');
  });

  it('uses ambulatory class code', () => {
    const result = mapEncounter(baseEncounter, patientId);
    expect(result.class.code).toBe('AMB');
  });
});

// ─── mapConditions ─────────────────────────────────────────────────────────

describe('mapConditions', () => {
  it('returns empty array when no diagnosis', () => {
    expect(mapConditions({ ...baseEncounter, diagnosis: undefined }, patientId)).toEqual([]);
    expect(mapConditions({ ...baseEncounter, diagnosis: [] }, patientId)).toEqual([]);
  });

  it('maps each diagnosis to a Condition resource', () => {
    const results = mapConditions(baseEncounter, patientId);
    expect(results).toHaveLength(2);
    expect(results[0].resourceType).toBe('Condition');
    expect(results[0].code.coding?.[0].code).toBe('I10');
    expect(results[0].code.text).toBe('Essential hypertension');
    expect(results[0].subject.reference).toBe(`Patient/${patientId}`);
    expect(results[0].encounter.reference).toBe(`Encounter/${encounterId}`);
  });

  it('uses ICD-10 coding system', () => {
    const results = mapConditions(baseEncounter, patientId);
    expect(results[0].code.coding?.[0].system).toBe('http://hl7.org/fhir/sid/icd-10');
  });

  it('sets encounter-diagnosis category', () => {
    const results = mapConditions(baseEncounter, patientId);
    expect(results[0].category[0].coding?.[0].code).toBe('encounter-diagnosis');
  });
});

// ─── mapObservations ───────────────────────────────────────────────────────

describe('mapObservations', () => {
  it('returns empty array when no vitalSigns', () => {
    expect(mapObservations({ ...baseEncounter, vitalSigns: undefined }, patientId)).toEqual([]);
    expect(mapObservations({ ...baseEncounter, vitalSigns: {} }, patientId)).toEqual([]);
  });

  it('maps blood pressure as a panel with two components', () => {
    const results = mapObservations(baseEncounter, patientId);
    const bp = results.find((o) => o.id === `${encounterId}-bp`);
    expect(bp).toBeDefined();
    expect(bp!.component).toHaveLength(2);
    expect(bp!.component![0].valueQuantity?.value).toBe(130);
    expect(bp!.component![1].valueQuantity?.value).toBe(85);
  });

  it('maps scalar vitals with correct LOINC codes', () => {
    const results = mapObservations(baseEncounter, patientId);
    const hr = results.find((o) => o.id === `${encounterId}-heartRate`);
    expect(hr).toBeDefined();
    expect(hr!.code.coding?.[0].code).toBe('8867-4');
    expect(hr!.valueQuantity?.value).toBe(78);
    expect(hr!.valueQuantity?.unit).toBe('beats/min');
  });

  it('maps all 6 scalar vital types', () => {
    const results = mapObservations(baseEncounter, patientId);
    const ids = results.map((o) => o.id);
    expect(ids).toContain(`${encounterId}-heartRate`);
    expect(ids).toContain(`${encounterId}-temperature`);
    expect(ids).toContain(`${encounterId}-respiratoryRate`);
    expect(ids).toContain(`${encounterId}-oxygenSaturation`);
    expect(ids).toContain(`${encounterId}-weight`);
    expect(ids).toContain(`${encounterId}-height`);
  });

  it('sets subject and encounter references', () => {
    const results = mapObservations(baseEncounter, patientId);
    for (const obs of results) {
      expect(obs.subject.reference).toBe(`Patient/${patientId}`);
      expect(obs.encounter.reference).toBe(`Encounter/${encounterId}`);
    }
  });

  it('sets status to final', () => {
    const results = mapObservations(baseEncounter, patientId);
    for (const obs of results) {
      expect(obs.status).toBe('final');
    }
  });
});

// ─── mapMedicationRequests ─────────────────────────────────────────────────

describe('mapMedicationRequests', () => {
  it('returns empty array when no prescriptions', () => {
    expect(mapMedicationRequests({ ...baseEncounter, prescriptions: undefined }, patientId)).toEqual([]);
    expect(mapMedicationRequests({ ...baseEncounter, prescriptions: [] }, patientId)).toEqual([]);
  });

  it('maps prescription to MedicationRequest', () => {
    const results = mapMedicationRequests(baseEncounter, patientId);
    expect(results).toHaveLength(1);
    const rx = results[0];
    expect(rx.resourceType).toBe('MedicationRequest');
    expect(rx.intent).toBe('order');
    expect(rx.status).toBe('active');
    expect(rx.medicationCodeableConcept.text).toBe('Lisinopril (lisinopril)');
    expect(rx.subject.reference).toBe(`Patient/${patientId}`);
    expect(rx.encounter.reference).toBe(`Encounter/${encounterId}`);
  });

  it('sets dosage instruction text', () => {
    const results = mapMedicationRequests(baseEncounter, patientId);
    expect(results[0].dosageInstruction?.[0].text).toBe('10mg once daily for 30 days');
  });

  it('maps oral route to SNOMED code', () => {
    const results = mapMedicationRequests(baseEncounter, patientId);
    const route = results[0].dosageInstruction?.[0].route;
    expect(route?.coding?.[0].code).toBe('26643006');
  });

  it('sets dispenseRequest.numberOfRepeatsAllowed', () => {
    const results = mapMedicationRequests(baseEncounter, patientId);
    expect(results[0].dispenseRequest?.numberOfRepeatsAllowed).toBe(2);
  });

  it('sets authoredOn from prescribedAt', () => {
    const results = mapMedicationRequests(baseEncounter, patientId);
    expect(results[0].authoredOn).toBe('2024-03-01T11:00:00.000Z');
  });

  it('uses drug name only when no genericName', () => {
    const enc = {
      ...baseEncounter,
      prescriptions: [{ ...baseEncounter.prescriptions[0], genericName: undefined }],
    };
    const results = mapMedicationRequests(enc, patientId);
    expect(results[0].medicationCodeableConcept.text).toBe('Lisinopril');
  });
});

// ─── buildFhirBundle ───────────────────────────────────────────────────────

describe('buildFhirBundle', () => {
  it('returns a valid FHIR Bundle', () => {
    const bundle = buildFhirBundle(basePatient, [baseEncounter]);
    expect(bundle.resourceType).toBe('Bundle');
    expect(bundle.type).toBe('collection');
    expect(bundle.timestamp).toBeDefined();
  });

  it('includes Patient as first entry', () => {
    const bundle = buildFhirBundle(basePatient, [baseEncounter]);
    expect(bundle.entry[0].resource.resourceType).toBe('Patient');
  });

  it('includes Encounter, Condition, Observation, and MedicationRequest entries', () => {
    const bundle = buildFhirBundle(basePatient, [baseEncounter]);
    const types = bundle.entry.map((e) => e.resource.resourceType);
    expect(types).toContain('Encounter');
    expect(types).toContain('Condition');
    expect(types).toContain('Observation');
    expect(types).toContain('MedicationRequest');
  });

  it('produces correct entry count for full encounter', () => {
    const bundle = buildFhirBundle(basePatient, [baseEncounter]);
    // 1 Patient + 1 Encounter + 2 Conditions + 7 Observations (bp + 6 scalars) + 1 MedicationRequest = 12
    expect(bundle.entry).toHaveLength(12);
  });

  it('handles empty encounters array', () => {
    const bundle = buildFhirBundle(basePatient, []);
    expect(bundle.entry).toHaveLength(1);
    expect(bundle.entry[0].resource.resourceType).toBe('Patient');
  });
});
