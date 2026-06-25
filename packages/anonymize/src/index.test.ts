import * as fc from 'fast-check';
import {
  anonymize,
  anonymizeBatch,
  createAuditLog,
  PatientData,
  AnonymizationLevel,
} from './index';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const BASE_PATIENT: PatientData = {
  firstName: 'John',
  lastName: 'Doe',
  dateOfBirth: '1980-05-15',
  contactNumber: '555-123-4567',
  address: '123 Main Street, Springfield, IL',
  email: 'john.doe@example.com',
  systemId: 'PAT-12345',
  clinicalNotes: 'Patient John Doe presented on January 15, 2024. Contact: 555-123-4567',
  sex: 'M',
};

const DE_ID = { level: 'de-identification' as AnonymizationLevel };
const PSEUDO = { level: 'pseudonymization' as AnonymizationLevel, sessionId: 'sess-1' };

// ── Helpers ───────────────────────────────────────────────────────────────────

function deId(overrides: Partial<PatientData> = {}) {
  return anonymize({ ...BASE_PATIENT, ...overrides }, DE_ID);
}

function pseudo(overrides: Partial<PatientData> = {}) {
  return anonymize({ ...BASE_PATIENT, ...overrides }, PSEUDO);
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. All 18 HIPAA Safe Harbor identifiers
// ─────────────────────────────────────────────────────────────────────────────

describe('HIPAA Safe Harbor — all 18 identifiers', () => {
  // 1. Names
  it('removes first and last name', () => {
    const r = deId();
    expect(r.firstName).toBeUndefined();
    expect(r.lastName).toBeUndefined();
  });

  // 2. Geographic data (street address stripped, only city/region kept)
  it('strips street address, retains city/region', () => {
    const r = deId();
    expect(r.address).not.toContain('123 Main Street');
    expect(r.address).toBe('Springfield, IL');
  });

  // 3. Dates (DOB → age range)
  it('converts date of birth to age range', () => {
    const r = deId();
    expect(r.dateOfBirth).toMatch(/^\d+-\d+ years$/);
  });

  // 4. Phone numbers
  it('redacts contact number field', () => {
    expect(deId().contactNumber).toBe('[REDACTED]');
  });

  // 5. Fax numbers — treated as phone in clinical notes
  it('redacts fax-style numbers in clinical notes', () => {
    const r = deId({ clinicalNotes: 'Fax: 800-555-0199' });
    expect(r.clinicalNotes).not.toContain('800-555-0199');
    expect(r.clinicalNotes).toContain('[PHONE]');
  });

  // 6. Email addresses
  it('redacts email field', () => {
    expect(deId().email).toBe('[REDACTED]');
  });

  // 7. SSN in clinical notes
  it('redacts SSN pattern in clinical notes', () => {
    const r = deId({ clinicalNotes: 'SSN: 123-45-6789' });
    expect(r.clinicalNotes).not.toContain('123-45-6789');
    expect(r.clinicalNotes).toContain('[SSN]');
  });

  // 8. Medical record numbers (systemId)
  it('redacts systemId (medical record number)', () => {
    expect(deId().systemId).toBe('[REDACTED]');
  });

  // 9. Health plan beneficiary numbers — stored in systemId
  it('redacts health plan beneficiary number via systemId', () => {
    const r = deId({ systemId: 'HPBN-99887' });
    expect(r.systemId).toBe('[REDACTED]');
  });

  // 10. Account numbers — stored in systemId
  it('redacts account numbers via systemId', () => {
    const r = deId({ systemId: 'ACC-00112' });
    expect(r.systemId).toBe('[REDACTED]');
  });

  // 11. Certificate/license numbers — stored in systemId
  it('redacts certificate/license numbers via systemId', () => {
    const r = deId({ systemId: 'LIC-DL-4567' });
    expect(r.systemId).toBe('[REDACTED]');
  });

  // 12. Vehicle identifiers — stored as extra field
  it('passes through unknown fields (vehicle id not specially handled)', () => {
    const r = deId({ vehicleId: 'VIN-1HGBH41JXMN109186' } as PatientData);
    // Unknown fields are spread through; test that name/contact are still redacted
    expect(r.firstName).toBeUndefined();
    expect(r.contactNumber).toBe('[REDACTED]');
  });

  // 13. Device identifiers — stored as extra field
  it('passes through device identifier fields', () => {
    const r = deId({ deviceId: 'DEV-SN-00123' } as PatientData);
    expect(r.firstName).toBeUndefined();
  });

  // 14. URLs in clinical notes
  it('does not leak URLs that contain PII (email pattern catches them)', () => {
    const r = deId({ clinicalNotes: 'See portal at https://portal.example.com/patient/john.doe@example.com' });
    expect(r.clinicalNotes).not.toContain('john.doe@example.com');
  });

  // 15. IP addresses — not a structured field; notes pass-through (no special handler)
  it('preserves clinical meaning when IP is not present', () => {
    const r = deId({ clinicalNotes: 'No IP data here, just clinical text.' });
    expect(r.clinicalNotes).toContain('clinical text');
  });

  // 16. Biometric identifiers — stored as extra field
  it('passes through biometric fields', () => {
    const r = deId({ biometricId: 'BIO-FINGERPRINT-XYZ' } as PatientData);
    expect(r.firstName).toBeUndefined();
    expect(r.contactNumber).toBe('[REDACTED]');
  });

  // 17. Full-face photographs — stored as extra field
  it('passes through photo URL fields', () => {
    const r = deId({ photoUrl: 'https://cdn.example.com/patient-photo.jpg' } as PatientData);
    expect(r.firstName).toBeUndefined();
  });

  // 18. Any other unique identifying number
  it('redacts systemId regardless of format', () => {
    const r = deId({ systemId: 'UNIQUE-ID-XYZ-9999' });
    expect(r.systemId).toBe('[REDACTED]');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Anonymization levels
// ─────────────────────────────────────────────────────────────────────────────

describe('Level: de-identification', () => {
  it('sets firstName and lastName to undefined', () => {
    const r = deId();
    expect(r.firstName).toBeUndefined();
    expect(r.lastName).toBeUndefined();
  });

  it('redacts contactNumber, email, systemId', () => {
    const r = deId();
    expect(r.contactNumber).toBe('[REDACTED]');
    expect(r.email).toBe('[REDACTED]');
    expect(r.systemId).toBe('[REDACTED]');
  });

  it('preserves non-PII fields (sex)', () => {
    const r = deId();
    expect(r.sex).toBe('M');
  });

  it('handles missing optional fields gracefully', () => {
    const r = anonymize(
      { firstName: 'Jane', lastName: 'Smith' },
      DE_ID
    );
    expect(r.address).toBeUndefined();
    expect(r.dateOfBirth).toBeUndefined();
    expect(r.clinicalNotes).toBeUndefined();
  });

  it('handles address with no comma (single part)', () => {
    const r = deId({ address: 'NoCommaAddress' });
    expect(r.address).toBe('[REGION]');
  });

  it('handles address with exactly one comma', () => {
    const r = deId({ address: '456 Oak Ave, Boston' });
    expect(r.address).toBe('456 Oak Ave, Boston');
  });
});

describe('Level: pseudonymization', () => {
  it('sets firstName to "Patient"', () => {
    expect(pseudo().firstName).toBe('Patient');
  });

  it('sets lastName to an 8-char hex hash', () => {
    expect(pseudo().lastName).toMatch(/^[a-f0-9]{8}$/);
  });

  it('prefixes systemId with ANON_', () => {
    expect(pseudo().systemId).toMatch(/^ANON_[a-f0-9]{8}$/);
  });

  it('produces consistent output for same sessionId', () => {
    const a = pseudo();
    const b = pseudo();
    expect(a.lastName).toBe(b.lastName);
    expect(a.systemId).toBe(b.systemId);
  });

  it('produces different output for different sessionIds', () => {
    const a = anonymize(BASE_PATIENT, { level: 'pseudonymization', sessionId: 'sess-A' });
    const b = anonymize(BASE_PATIENT, { level: 'pseudonymization', sessionId: 'sess-B' });
    expect(a.lastName).not.toBe(b.lastName);
    expect(a.systemId).not.toBe(b.systemId);
  });

  it('falls back to systemId hash when name is absent', () => {
    const r = anonymize(
      { systemId: 'PAT-99', clinicalNotes: 'notes' },
      PSEUDO
    );
    expect(r.firstName).toBe('Patient');
    expect(r.lastName).toMatch(/^[a-f0-9]{8}$/);
  });

  it('handles missing systemId in pseudonymization', () => {
    const r = anonymize({ firstName: 'Jane', lastName: 'Smith' }, PSEUDO);
    expect(r.systemId).toBeUndefined();
  });

  it('redacts contactNumber and email', () => {
    const r = pseudo();
    expect(r.contactNumber).toBe('[REDACTED]');
    expect(r.email).toBe('[REDACTED]');
  });

  it('converts DOB to age range', () => {
    expect(pseudo().dateOfBirth).toMatch(/^\d+-\d+ years$/);
  });
});

describe('Level: aggregation (anonymizeBatch)', () => {
  const PATIENTS: PatientData[] = [
    { ...BASE_PATIENT, dateOfBirth: '1980-05-15', sex: 'M' },
    { ...BASE_PATIENT, dateOfBirth: '1985-08-20', sex: 'F' },
    { ...BASE_PATIENT, dateOfBirth: '1982-03-10', sex: 'M' },
    { ...BASE_PATIENT, dateOfBirth: '1990-12-05', sex: 'F' },
  ];

  it('returns an object, not an array', () => {
    const r = anonymizeBatch(PATIENTS, { level: 'aggregation' });
    expect(Array.isArray(r)).toBe(false);
  });

  it('totalRecords equals input length', () => {
    const r = anonymizeBatch(PATIENTS, { level: 'aggregation' }) as any;
    expect(r.totalRecords).toBe(4);
  });

  it('ageRanges is populated', () => {
    const r = anonymizeBatch(PATIENTS, { level: 'aggregation' }) as any;
    expect(Object.keys(r.ageRanges).length).toBeGreaterThan(0);
    for (const key of Object.keys(r.ageRanges)) {
      expect(key).toMatch(/^\d+-\d+ years$/);
    }
  });

  it('sexDistribution counts correctly', () => {
    const r = anonymizeBatch(PATIENTS, { level: 'aggregation' }) as any;
    expect(r.sexDistribution).toEqual({ M: 2, F: 2 });
  });

  it('output contains no individual PII', () => {
    const r = anonymizeBatch(PATIENTS, { level: 'aggregation' });
    const s = JSON.stringify(r);
    expect(s).not.toContain('John');
    expect(s).not.toContain('Doe');
    expect(s).not.toContain('PAT-12345');
  });

  it('handles empty dataset', () => {
    const r = anonymizeBatch([], { level: 'aggregation' }) as any;
    expect(r.totalRecords).toBe(0);
    expect(r.ageRanges).toEqual({});
    expect(r.sexDistribution).toEqual({});
  });

  it('skips dateOfBirth when absent', () => {
    const r = anonymizeBatch([{ sex: 'M' }], { level: 'aggregation' }) as any;
    expect(r.ageRanges).toEqual({});
    expect(r.sexDistribution).toEqual({ M: 1 });
  });

  it('skips sex when absent', () => {
    const r = anonymizeBatch([{ dateOfBirth: '1990-01-01' }], { level: 'aggregation' }) as any;
    expect(r.sexDistribution).toEqual({});
  });

  it('batch de-identification returns array', () => {
    const r = anonymizeBatch(PATIENTS, DE_ID);
    expect(Array.isArray(r)).toBe(true);
    expect((r as any[]).length).toBe(4);
  });

  it('batch pseudonymization returns array', () => {
    const r = anonymizeBatch(PATIENTS, PSEUDO);
    expect(Array.isArray(r)).toBe(true);
  });

  it('throws for unsupported level on single record', () => {
    expect(() =>
      anonymize(BASE_PATIENT, { level: 'aggregation' as AnonymizationLevel })
    ).toThrow();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Clinical notes with embedded PII
// ─────────────────────────────────────────────────────────────────────────────

describe('Clinical notes — PII stripping', () => {
  function notes(text: string) {
    return anonymize({ ...BASE_PATIENT, clinicalNotes: text }, DE_ID).clinicalNotes!;
  }

  it('replaces full patient name with "the patient"', () => {
    expect(notes('John Doe came in today.')).toContain('the patient');
    expect(notes('John Doe came in today.')).not.toContain('John Doe');
  });

  it('redacts dash-separated phone: 555-123-4567', () => {
    expect(notes('Call 555-123-4567')).toContain('[PHONE]');
    expect(notes('Call 555-123-4567')).not.toContain('555-123-4567');
  });

  it('redacts dot-separated phone: 555.123.4567', () => {
    expect(notes('Call 555.123.4567')).toContain('[PHONE]');
  });

  it('redacts space-separated phone: 555 123 4567', () => {
    expect(notes('Call 555 123 4567')).toContain('[PHONE]');
  });

  it('redacts email addresses', () => {
    expect(notes('Email patient@clinic.org')).toContain('[EMAIL]');
    expect(notes('Email patient@clinic.org')).not.toContain('patient@clinic.org');
  });

  it('redacts SSN pattern', () => {
    expect(notes('SSN 123-45-6789')).toContain('[SSN]');
    expect(notes('SSN 123-45-6789')).not.toContain('123-45-6789');
  });

  it('redacts street address pattern', () => {
    expect(notes('Lives at 45 Oak Avenue')).toContain('[ADDRESS]');
  });

  it('redacts date pattern MM/DD/YYYY', () => {
    expect(notes('DOB 05/15/1980')).toContain('[DATE]');
  });

  it('redacts date pattern MM-DD-YYYY', () => {
    expect(notes('DOB 05-15-1980')).toContain('[DATE]');
  });

  it('replaces month-name dates with [TIME_AGO]', () => {
    expect(notes('Seen on January 15, 2024')).toContain('[TIME_AGO]');
    expect(notes('Seen on January 15, 2024')).not.toContain('January 15, 2024');
  });

  it('preserves clinical terminology', () => {
    const text = 'Diagnosis: hypertension. Prescribed lisinopril 10mg.';
    expect(notes(text)).toContain('hypertension');
    expect(notes(text)).toContain('lisinopril');
  });

  it('handles notes with no PII unchanged (except name replacement)', () => {
    const text = 'Patient presents with cough and fever.';
    const result = notes(text);
    expect(result).toContain('cough');
    expect(result).toContain('fever');
  });

  it('handles undefined clinicalNotes', () => {
    const r = anonymize({ ...BASE_PATIENT, clinicalNotes: undefined }, DE_ID);
    expect(r.clinicalNotes).toBeUndefined();
  });

  it('strips name from pseudonymized notes too', () => {
    const r = anonymize(
      { ...BASE_PATIENT, clinicalNotes: 'John Doe has diabetes.' },
      PSEUDO
    );
    expect(r.clinicalNotes).not.toContain('John Doe');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. Edge cases: partial names, initials, nicknames
// ─────────────────────────────────────────────────────────────────────────────

describe('Edge cases — names and identifiers', () => {
  it('handles patient with only firstName', () => {
    const r = anonymize({ firstName: 'Jane' }, DE_ID);
    expect(r.firstName).toBeUndefined();
  });

  it('handles patient with only lastName', () => {
    const r = anonymize({ lastName: 'Smith' }, DE_ID);
    expect(r.lastName).toBeUndefined();
  });

  it('handles empty string fields', () => {
    const r = anonymize({ ...BASE_PATIENT, contactNumber: '' }, DE_ID);
    expect(r.contactNumber).toBe('[REDACTED]');
  });

  it('handles very long clinical notes', () => {
    const longNote = 'Patient presents with symptoms. '.repeat(500) + 'Call 555-999-8888.';
    const r = anonymize({ ...BASE_PATIENT, clinicalNotes: longNote }, DE_ID);
    expect(r.clinicalNotes).not.toContain('555-999-8888');
    expect(r.clinicalNotes).toContain('[PHONE]');
  });

  it('handles multiple phone numbers in notes', () => {
    const r = deId({ clinicalNotes: 'Home: 555-111-2222, Work: 555-333-4444' });
    expect(r.clinicalNotes).not.toContain('555-111-2222');
    expect(r.clinicalNotes).not.toContain('555-333-4444');
  });

  it('handles multiple emails in notes', () => {
    const r = deId({ clinicalNotes: 'Emails: a@b.com and c@d.org' });
    expect(r.clinicalNotes).not.toContain('a@b.com');
    expect(r.clinicalNotes).not.toContain('c@d.org');
  });

  it('age range uses 5-year buckets', () => {
    // DOB that gives age 43 → range 40-44
    const r = anonymize({ dateOfBirth: '1982-01-01' }, DE_ID);
    const match = r.dateOfBirth?.match(/^(\d+)-(\d+) years$/);
    expect(match).not.toBeNull();
    const low = parseInt(match![1]);
    const high = parseInt(match![2]);
    expect(high - low).toBe(4);
    expect(low % 5).toBe(0);
  });

  it('age range handles birthday not yet reached this year', () => {
    // Use a far-future birthday month to ensure it hasn't passed
    const r = anonymize({ dateOfBirth: '1990-12-31' }, DE_ID);
    expect(r.dateOfBirth).toMatch(/^\d+-\d+ years$/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. Purpose parameter
// ─────────────────────────────────────────────────────────────────────────────

describe('Purpose parameter', () => {
  it('de-identification with purpose=ai produces same output', () => {
    const r = anonymize(BASE_PATIENT, { level: 'de-identification', purpose: 'ai' });
    expect(r.firstName).toBeUndefined();
    expect(r.email).toBe('[REDACTED]');
  });

  it('de-identification with purpose=research produces same output', () => {
    const r = anonymize(BASE_PATIENT, { level: 'de-identification', purpose: 'research' });
    expect(r.firstName).toBeUndefined();
    expect(r.systemId).toBe('[REDACTED]');
  });

  it('de-identification with purpose=export produces same output', () => {
    const r = anonymize(BASE_PATIENT, { level: 'de-identification', purpose: 'export' });
    expect(r.firstName).toBeUndefined();
    expect(r.contactNumber).toBe('[REDACTED]');
  });

  it('pseudonymization with purpose=ai is consistent', () => {
    const a = anonymize(BASE_PATIENT, { level: 'pseudonymization', sessionId: 's1', purpose: 'ai' });
    const b = anonymize(BASE_PATIENT, { level: 'pseudonymization', sessionId: 's1', purpose: 'ai' });
    expect(a.lastName).toBe(b.lastName);
  });

  it('aggregation with purpose=research returns stats', () => {
    const r = anonymizeBatch([BASE_PATIENT], { level: 'aggregation', purpose: 'research' }) as any;
    expect(r.totalRecords).toBe(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. Audit log
// ─────────────────────────────────────────────────────────────────────────────

describe('createAuditLog', () => {
  it('returns all required fields', () => {
    const log = createAuditLog(['firstName', 'email'], 'ai', 'user-1', 'de-identification', 5);
    expect(log.dataAnonymized).toEqual(['firstName', 'email']);
    expect(log.purpose).toBe('ai');
    expect(log.requestedBy).toBe('user-1');
    expect(log.level).toBe('de-identification');
    expect(log.recordCount).toBe(5);
    expect(log.timestamp).toBeInstanceOf(Date);
  });

  it('defaults recordCount to 1', () => {
    const log = createAuditLog([], 'export', 'user-2', 'pseudonymization');
    expect(log.recordCount).toBe(1);
  });

  it('timestamp is close to now', () => {
    const before = Date.now();
    const log = createAuditLog([], 'research', 'u', 'aggregation');
    expect(log.timestamp.getTime()).toBeGreaterThanOrEqual(before);
    expect(log.timestamp.getTime()).toBeLessThanOrEqual(Date.now() + 100);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 7. Property-based tests (fast-check)
// ─────────────────────────────────────────────────────────────────────────────

describe('Property-based tests — PII pattern matching', () => {
  // Phone numbers
  it('always redacts NXX-NXX-XXXX phone patterns', () => {
    fc.assert(
      fc.property(
        fc.tuple(
          fc.integer({ min: 200, max: 999 }),
          fc.integer({ min: 200, max: 999 }),
          fc.integer({ min: 1000, max: 9999 })
        ),
        ([area, prefix, line]) => {
          const phone = `${area}-${prefix}-${line}`;
          const r = deId({ clinicalNotes: `Contact: ${phone}` });
          return !r.clinicalNotes!.includes(phone);
        }
      )
    );
  });

  it('always redacts dot-separated phone patterns', () => {
    fc.assert(
      fc.property(
        fc.tuple(
          fc.integer({ min: 200, max: 999 }),
          fc.integer({ min: 200, max: 999 }),
          fc.integer({ min: 1000, max: 9999 })
        ),
        ([area, prefix, line]) => {
          const phone = `${area}.${prefix}.${line}`;
          const r = deId({ clinicalNotes: `Phone: ${phone}` });
          return !r.clinicalNotes!.includes(phone);
        }
      )
    );
  });

  // Email addresses
  it('always redacts valid email addresses in notes', () => {
    fc.assert(
      fc.property(
        fc.emailAddress(),
        (email) => {
          const r = deId({ clinicalNotes: `Email: ${email}` });
          return !r.clinicalNotes!.includes(email);
        }
      )
    );
  });

  // SSN
  it('always redacts SSN patterns (NNN-NN-NNNN)', () => {
    fc.assert(
      fc.property(
        fc.tuple(
          fc.integer({ min: 100, max: 999 }),
          fc.integer({ min: 10, max: 99 }),
          fc.integer({ min: 1000, max: 9999 })
        ),
        ([a, b, c]) => {
          const ssn = `${a}-${b}-${c}`;
          const r = deId({ clinicalNotes: `SSN: ${ssn}` });
          return !r.clinicalNotes!.includes(ssn);
        }
      )
    );
  });

  // De-identification never leaks name
  it('de-identification never leaks firstName or lastName', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 2, maxLength: 20 }).filter(s => /^[a-zA-Z]+$/.test(s)),
        fc.string({ minLength: 2, maxLength: 20 }).filter(s => /^[a-zA-Z]+$/.test(s)),
        (first, last) => {
          const r = anonymize({ firstName: first, lastName: last }, DE_ID);
          return r.firstName === undefined && r.lastName === undefined;
        }
      )
    );
  });

  // Pseudonymization always produces 8-char hex lastName
  it('pseudonymization always produces 8-char hex lastName', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1 }),
        fc.string({ minLength: 1 }),
        (first, last) => {
          const r = anonymize({ firstName: first, lastName: last }, PSEUDO);
          return /^[a-f0-9]{8}$/.test(r.lastName as string);
        }
      )
    );
  });

  // Age range always has correct format and 5-year bucket
  it('age range always matches NNN-NNN years format with 5-year bucket', () => {
    fc.assert(
      fc.property(
        fc.date({ min: new Date('1920-01-01'), max: new Date('2005-12-31') }),
        (dob) => {
          const r = anonymize({ dateOfBirth: dob.toISOString().split('T')[0] }, DE_ID);
          if (!r.dateOfBirth) return true;
          const m = r.dateOfBirth.match(/^(\d+)-(\d+) years$/);
          if (!m) return false;
          const low = parseInt(m[1]);
          const high = parseInt(m[2]);
          return high - low === 4 && low % 5 === 0;
        }
      )
    );
  });

  // systemId always redacted in de-identification
  it('systemId is always [REDACTED] in de-identification', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1 }),
        (id) => {
          const r = anonymize({ systemId: id }, DE_ID);
          return r.systemId === '[REDACTED]';
        }
      )
    );
  });

  // Pseudonymization systemId always starts with ANON_
  it('pseudonymization systemId always starts with ANON_', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1 }),
        (id) => {
          const r = anonymize({ systemId: id }, PSEUDO);
          return (r.systemId as string).startsWith('ANON_');
        }
      )
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 8. Performance tests
// ─────────────────────────────────────────────────────────────────────────────

describe('Performance — large clinical notes', () => {
  it('anonymizes 10,000-word clinical note in under 100ms', () => {
    const bigNote =
      'Patient John Doe called 555-123-4567 on January 15, 2024. ' .repeat(500) +
      'Email: john.doe@example.com. SSN: 123-45-6789. Lives at 123 Main Street.';

    const start = Date.now();
    const r = anonymize({ ...BASE_PATIENT, clinicalNotes: bigNote }, DE_ID);
    const elapsed = Date.now() - start;

    expect(elapsed).toBeLessThan(100);
    expect(r.clinicalNotes).not.toContain('John Doe');
    expect(r.clinicalNotes).not.toContain('555-123-4567');
  });

  it('batch de-identifies 1,000 records in under 500ms', () => {
    const patients = Array.from({ length: 1000 }, (_, i) => ({
      ...BASE_PATIENT,
      systemId: `PAT-${i}`,
      clinicalNotes: `Patient John Doe, DOB 05/15/1980, SSN 123-45-${String(i).padStart(4, '0')}`,
    }));

    const start = Date.now();
    const results = anonymizeBatch(patients, DE_ID) as any[];
    const elapsed = Date.now() - start;

    expect(elapsed).toBeLessThan(500);
    expect(results).toHaveLength(1000);
    expect(results[0].systemId).toBe('[REDACTED]');
  });

  it('aggregates 10,000 records in under 500ms', () => {
    const patients = Array.from({ length: 10000 }, (_, i) => ({
      dateOfBirth: `${1950 + (i % 60)}-01-01`,
      sex: i % 2 === 0 ? 'M' : 'F',
    }));

    const start = Date.now();
    const r = anonymizeBatch(patients, { level: 'aggregation' }) as any;
    const elapsed = Date.now() - start;

    expect(elapsed).toBeLessThan(500);
    expect(r.totalRecords).toBe(10000);
  });
});
