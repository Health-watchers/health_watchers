import {
  mapPatient,
  mapEncounter,
  mapConditions,
  mapObservations,
  mapMedicationRequests,
  mapCoverage,
  buildFhirBundle,
} from './fhir-mapper';

const PATIENT = {
  _id: '507f1f77bcf86cd799439011',
  systemId: 'HW-0001',
  firstName: 'Jane',
  lastName: 'Doe',
  sex: 'F',
  dateOfBirth: '1990-05-15',
  contactNumber: '+2348012345678',
  address: '12 Lagos Street',
  isActive: true,
};

const ENCOUNTER = {
  _id: '507f1f77bcf86cd799439022',
  status: 'closed',
  type: 'consultation',
  chiefComplaint: 'Headache',
  createdAt: new Date('2026-01-10T09:00:00Z'),
  diagnosis: [{ code: 'G43.9', description: 'Migraine, unspecified' }],
  vitalSigns: { heartRate: 72, temperature: 36.6, bloodPressure: '120/80', oxygenSaturation: 98 },
  prescriptions: [{
    drugName: 'Ibuprofen',
    genericName: 'Ibuprofen',
    dosage: '400mg',
    frequency: 'TID',
    duration: '5 days',
    route: 'oral',
    prescribedAt: new Date('2026-01-10T09:30:00Z'),
  }],
};

describe('fhir-mapper', () => {
  describe('mapPatient', () => {
    it('returns resourceType Patient', () => {
      expect(mapPatient(PATIENT).resourceType).toBe('Patient');
    });

    it('maps sex F to female', () => {
      expect(mapPatient(PATIENT).gender).toBe('female');
    });

    it('maps sex M to male', () => {
      expect(mapPatient({ ...PATIENT, sex: 'M' }).gender).toBe('male');
    });

    it('maps sex O to other', () => {
      expect(mapPatient({ ...PATIENT, sex: 'O' }).gender).toBe('other');
    });

    it('includes systemId as identifier', () => {
      const p = mapPatient(PATIENT);
      expect(p.identifier[0].value).toBe('HW-0001');
    });

    it('includes birthDate', () => {
      expect(mapPatient(PATIENT).birthDate).toBe('1990-05-15');
    });

    it('includes telecom when contactNumber present', () => {
      expect(mapPatient(PATIENT).telecom?.[0].value).toBe('+2348012345678');
    });

    it('omits telecom when contactNumber absent', () => {
      const { contactNumber: _, ...p } = PATIENT;
      expect(mapPatient(p).telecom).toBeUndefined();
    });
  });

  describe('mapEncounter', () => {
    it('returns resourceType Encounter', () => {
      expect(mapEncounter(ENCOUNTER, PATIENT._id).resourceType).toBe('Encounter');
    });

    it('maps closed status to finished', () => {
      expect(mapEncounter(ENCOUNTER, PATIENT._id).status).toBe('finished');
    });

    it('maps open status to in-progress', () => {
      expect(mapEncounter({ ...ENCOUNTER, status: 'open' }, PATIENT._id).status).toBe('in-progress');
    });

    it('sets subject reference to Patient/{id}', () => {
      expect(mapEncounter(ENCOUNTER, PATIENT._id).subject.reference).toBe(`Patient/${PATIENT._id}`);
    });
  });

  describe('mapConditions', () => {
    it('returns one Condition per diagnosis', () => {
      const conditions = mapConditions(ENCOUNTER, PATIENT._id);
      expect(conditions).toHaveLength(1);
      expect(conditions[0].resourceType).toBe('Condition');
    });

    it('uses ICD-10 coding system', () => {
      const c = mapConditions(ENCOUNTER, PATIENT._id)[0];
      expect(c.code.coding[0].system).toBe('http://hl7.org/fhir/sid/icd-10');
      expect(c.code.coding[0].code).toBe('G43.9');
    });

    it('returns empty array when no diagnosis', () => {
      expect(mapConditions({ ...ENCOUNTER, diagnosis: [] }, PATIENT._id)).toHaveLength(0);
    });
  });

  describe('mapObservations', () => {
    it('creates Observation for heartRate', () => {
      const obs = mapObservations(ENCOUNTER, PATIENT._id);
      const hr = obs.find((o) => o.id.includes('heartRate'));
      expect(hr).toBeDefined();
      expect(hr!.valueQuantity?.value).toBe(72);
    });

    it('creates Observation for bloodPressure as valueString', () => {
      const obs = mapObservations(ENCOUNTER, PATIENT._id);
      const bp = obs.find((o) => o.id.includes('bp'));
      expect(bp).toBeDefined();
      expect(bp!.valueString).toBe('120/80');
    });

    it('uses LOINC coding system', () => {
      const obs = mapObservations(ENCOUNTER, PATIENT._id);
      expect(obs[0].code.coding[0].system).toBe('http://loinc.org');
    });

    it('returns empty array when no vitalSigns', () => {
      expect(mapObservations({ ...ENCOUNTER, vitalSigns: undefined }, PATIENT._id)).toHaveLength(0);
    });
  });

  describe('mapMedicationRequests', () => {
    it('returns one MedicationRequest per prescription', () => {
      const rxs = mapMedicationRequests(ENCOUNTER, PATIENT._id);
      expect(rxs).toHaveLength(1);
      expect(rxs[0].resourceType).toBe('MedicationRequest');
    });

    it('includes drug name in medicationCodeableConcept', () => {
      const rx = mapMedicationRequests(ENCOUNTER, PATIENT._id)[0];
      expect(rx.medicationCodeableConcept.text).toContain('Ibuprofen');
    });

    it('returns empty array when no prescriptions', () => {
      expect(mapMedicationRequests({ ...ENCOUNTER, prescriptions: [] }, PATIENT._id)).toHaveLength(0);
    });
  });

  describe('buildFhirBundle', () => {
    it('returns resourceType Bundle', () => {
      expect(buildFhirBundle(PATIENT, [ENCOUNTER]).resourceType).toBe('Bundle');
    });

    it('includes Patient, Encounter, Condition, Observation, MedicationRequest entries', () => {
      const bundle = buildFhirBundle(PATIENT, [ENCOUNTER]);
      const types = bundle.entry.map((e) => e.resource.resourceType);
      expect(types).toContain('Patient');
      expect(types).toContain('Encounter');
      expect(types).toContain('Condition');
      expect(types).toContain('Observation');
      expect(types).toContain('MedicationRequest');
    });

    it('total matches entry count', () => {
      const bundle = buildFhirBundle(PATIENT, [ENCOUNTER]);
      expect(bundle.total).toBe(bundle.entry.length);
    });

    it('handles patient with no encounters', () => {
      const bundle = buildFhirBundle(PATIENT, []);
      expect(bundle.entry).toHaveLength(1);
      expect(bundle.entry[0].resource.resourceType).toBe('Patient');
    });

    it('includes Coverage resources in bundle when patient has insurance', () => {
      const patientWithInsurance = {
        ...PATIENT,
        insurance: [
          {
            provider: 'Blue Cross Blue Shield',
            policyNumber: 'XYZ123456789',
            groupNumber: 'GRP-001',
            coverageType: 'PPO',
            effectiveDate: '2024-01-01',
            expirationDate: '2024-12-31',
            isPrimary: true,
          },
        ],
      };
      const bundle = buildFhirBundle(patientWithInsurance, []);
      const types = bundle.entry.map((e) => e.resource.resourceType);
      expect(types).toContain('Coverage');
    });

    it('does not include Coverage when patient has no insurance', () => {
      const bundle = buildFhirBundle(PATIENT, []);
      const types = bundle.entry.map((e) => e.resource.resourceType);
      expect(types).not.toContain('Coverage');
    });
  });
});

// ── mapCoverage ───────────────────────────────────────────────────────────────

const PATIENT_WITH_INSURANCE = {
  _id: '507f1f77bcf86cd799439011',
  insurance: [
    {
      provider: 'Blue Cross Blue Shield',
      policyNumber: 'XYZ123456789',
      groupNumber: 'GRP-001',
      coverageType: 'PPO',
      effectiveDate: '2024-01-01',
      expirationDate: '2024-12-31',
      isPrimary: true,
    },
    {
      provider: 'Aetna',
      policyNumber: 'AET-987654',
      coverageType: 'HMO',
      isPrimary: false,
    },
  ],
};

describe('mapCoverage', () => {
  it('returns one Coverage resource per insurance entry', () => {
    const coverages = mapCoverage(PATIENT_WITH_INSURANCE);
    expect(coverages).toHaveLength(2);
  });

  it('sets resourceType to Coverage', () => {
    const [cov] = mapCoverage(PATIENT_WITH_INSURANCE);
    expect(cov.resourceType).toBe('Coverage');
  });

  it('sets beneficiary reference to Patient/{id}', () => {
    const [cov] = mapCoverage(PATIENT_WITH_INSURANCE);
    expect(cov.beneficiary.reference).toBe(`Patient/${PATIENT_WITH_INSURANCE._id}`);
  });

  it('sets payor display to provider name', () => {
    const [cov] = mapCoverage(PATIENT_WITH_INSURANCE);
    expect(cov.payor[0].display).toBe('Blue Cross Blue Shield');
  });

  it('maps policyNumber to subscriberId', () => {
    const [cov] = mapCoverage(PATIENT_WITH_INSURANCE);
    expect(cov.subscriberId).toBe('XYZ123456789');
  });

  it('maps groupNumber to grouping.group', () => {
    const [cov] = mapCoverage(PATIENT_WITH_INSURANCE);
    expect(cov.grouping?.group).toBe('GRP-001');
  });

  it('sets order=1 for primary insurance', () => {
    const [primary] = mapCoverage(PATIENT_WITH_INSURANCE);
    expect(primary.order).toBe(1);
  });

  it('sets order>1 for non-primary insurance', () => {
    const [, secondary] = mapCoverage(PATIENT_WITH_INSURANCE);
    expect(secondary.order).toBeGreaterThan(1);
  });

  it('includes period.start and period.end when dates are set', () => {
    const [cov] = mapCoverage(PATIENT_WITH_INSURANCE);
    expect(cov.period?.start).toBe('2024-01-01');
    expect(cov.period?.end).toBe('2024-12-31');
  });

  it('omits period when no dates are set', () => {
    const [, secondary] = mapCoverage(PATIENT_WITH_INSURANCE);
    expect(secondary.period).toBeUndefined();
  });

  it('omits grouping when groupNumber is absent', () => {
    const [, secondary] = mapCoverage(PATIENT_WITH_INSURANCE);
    expect(secondary.grouping).toBeUndefined();
  });

  it('omits subscriberId when policyNumber is absent', () => {
    const patient = {
      _id: '507f1f77bcf86cd799439011',
      insurance: [{ provider: 'Aetna', coverageType: 'HMO', isPrimary: false }],
    };
    const [cov] = mapCoverage(patient);
    expect(cov.subscriberId).toBeUndefined();
  });

  it('includes FHIR type coding for PPO', () => {
    const [cov] = mapCoverage(PATIENT_WITH_INSURANCE);
    expect(cov.type?.coding[0].code).toBe('PPO');
    expect(cov.type?.coding[0].system).toBe('http://terminology.hl7.org/CodeSystem/v3-ActCode');
  });

  it('includes FHIR type coding for HMO', () => {
    const [, cov] = mapCoverage(PATIENT_WITH_INSURANCE);
    expect(cov.type?.coding[0].code).toBe('HMO');
  });

  it('maps Medicare coverageType to RETIRE code', () => {
    const patient = {
      _id: '507f1f77bcf86cd799439011',
      insurance: [{ provider: 'Medicare', policyNumber: 'MED-001', coverageType: 'Medicare', isPrimary: true }],
    };
    const [cov] = mapCoverage(patient);
    expect(cov.type?.coding[0].code).toBe('RETIRE');
  });

  it('maps Medicaid coverageType to PUBLICPOL code', () => {
    const patient = {
      _id: '507f1f77bcf86cd799439011',
      insurance: [{ provider: 'Medicaid', policyNumber: 'MCAID-001', coverageType: 'Medicaid', isPrimary: true }],
    };
    const [cov] = mapCoverage(patient);
    expect(cov.type?.coding[0].code).toBe('PUBLICPOL');
  });

  it('falls back to pay code for unknown coverageType', () => {
    const patient = {
      _id: '507f1f77bcf86cd799439011',
      insurance: [{ provider: 'Unknown', policyNumber: 'UNK-001', coverageType: 'other', isPrimary: false }],
    };
    const [cov] = mapCoverage(patient);
    expect(cov.type?.coding[0].code).toBe('pay');
  });

  it('returns empty array when patient has no insurance', () => {
    expect(mapCoverage({ _id: '507f1f77bcf86cd799439011', insurance: [] })).toHaveLength(0);
  });

  it('returns empty array when insurance property is absent', () => {
    expect(mapCoverage({ _id: '507f1f77bcf86cd799439011' })).toHaveLength(0);
  });

  it('generates unique id per coverage entry using patient id and index', () => {
    const coverages = mapCoverage(PATIENT_WITH_INSURANCE);
    expect(coverages[0].id).toBe(`${PATIENT_WITH_INSURANCE._id}-cov-0`);
    expect(coverages[1].id).toBe(`${PATIENT_WITH_INSURANCE._id}-cov-1`);
  });
});
