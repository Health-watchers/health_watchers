import {
  claimToBillingInput,
  isValidCpt,
  isValidIcd10,
  isValidNpi,
  MAX_DIAGNOSIS_CODES,
  MAX_SERVICE_LINES,
  validateClaimInput,
} from '../claim-validation';

const NOW = new Date('2026-10-22T12:00:00Z');

const valid = {
  encounterId: 'enc1',
  patientId: 'pat1',
  clinicId: 'clinic1',
  clinicNpi: '1234567893',
  patientDob: '1980-05-15',
  patientName: 'Doe, John',
  serviceDate: '2026-10-01',
  cptCodes: ['99213', 'G0439'],
  diagnosisCodes: ['Z00.00', 'I10'],
  amounts: [150, 75.5],
};

const fields = (input: Partial<typeof valid>) =>
  validateClaimInput(input, NOW).errors.map((e) => e.field);

describe('isValidNpi', () => {
  it('accepts an NPI with a correct check digit', () => {
    expect(isValidNpi('1234567893')).toBe(true);
  });
  it('rejects a wrong check digit, wrong length or non-digits', () => {
    expect(isValidNpi('1234567890')).toBe(false);
    expect(isValidNpi('123456789')).toBe(false);
    expect(isValidNpi('12345678AB')).toBe(false);
  });
});

describe('code formats', () => {
  it.each(['99213', '0001F', '0042T', 'G0439', 'J1100'])('accepts CPT/HCPCS %s', (c) =>
    expect(isValidCpt(c)).toBe(true)
  );
  it.each(['9921', '992134', 'ABCDE', ''])('rejects CPT %s', (c) => expect(isValidCpt(c)).toBe(false));
  it.each(['I10', 'Z00.00', 'J06.9', 'S72.001A', 'U07.1'])('accepts ICD-10 %s', (c) =>
    expect(isValidIcd10(c)).toBe(true)
  );
  it.each(['10', 'I1', 'Z00.000000', '123.4'])('rejects ICD-10 %s', (c) =>
    expect(isValidIcd10(c)).toBe(false)
  );
});

describe('validateClaimInput', () => {
  it('accepts a complete, well-formed claim', () => {
    expect(validateClaimInput(valid, NOW)).toEqual({ valid: true, errors: [] });
  });

  it('requires patient name (box 2) and DOB (box 3)', () => {
    expect(fields({ ...valid, patientName: ' ', patientDob: '' })).toEqual(
      expect.arrayContaining(['2', '3'])
    );
  });

  it('rejects impossible or future dates', () => {
    expect(fields({ ...valid, patientDob: '1980-02-30' })).toContain('3');
    expect(fields({ ...valid, patientDob: '2030-01-01' })).toContain('3');
    expect(fields({ ...valid, serviceDate: '2027-01-01' })).toContain('24A');
    expect(fields({ ...valid, serviceDate: '1970-01-01' })).toContain('24A');
  });

  it('validates diagnosis codes (box 21)', () => {
    expect(fields({ ...valid, diagnosisCodes: [] })).toContain('21');
    expect(fields({ ...valid, diagnosisCodes: ['I10', 'BAD'] })).toContain('21.B');
    expect(fields({ ...valid, diagnosisCodes: ['I10', 'i10'] })).toContain('21');
    expect(
      fields({ ...valid, diagnosisCodes: Array.from({ length: MAX_DIAGNOSIS_CODES + 1 }, (_, i) => `A0${i % 10}`) })
    ).toContain('21');
  });

  it('validates service lines (box 24D/24F)', () => {
    expect(fields({ ...valid, cptCodes: [], amounts: [] })).toContain('24D');
    expect(fields({ ...valid, cptCodes: ['99213', 'XYZ'] })).toContain('24D.2');
    expect(fields({ ...valid, amounts: [150] })).toContain('24F');
    expect(fields({ ...valid, amounts: [0, 75] })).toContain('24F.1');
    expect(fields({ ...valid, amounts: [150, 10.005] })).toContain('24F.2');
    expect(fields({ ...valid, amounts: [100000, 75] })).toContain('24F.1');
    const seven = Array(MAX_SERVICE_LINES + 1).fill('99213');
    expect(fields({ ...valid, cptCodes: seven, amounts: seven.map(() => 10) })).toContain('24D');
  });

  it('validates the billing provider NPI (box 33a)', () => {
    expect(fields({ ...valid, clinicNpi: '' })).toContain('33a');
    expect(fields({ ...valid, clinicNpi: '1234567890' })).toContain('33a');
  });
});

describe('claimToBillingInput', () => {
  it('rebuilds builder input from stored CMS-1500 data', () => {
    const input = claimToBillingInput({
      encounterId: 'e1',
      patientId: { _id: 'p1' },
      clinicId: 'c1',
      cptCodes: ['99213', '93000'],
      diagnosisCodes: ['I10'],
      cms1500Data: {
        box2_patientName: 'Doe, Jane',
        box3_patientDob: '1980-01-01',
        box33_billingProviderNpi: '1234567893',
        box24_servicelines: [
          { dateOfService: '2026-10-01', charges: 100 },
          { dateOfService: '2026-10-01', charges: 50 },
        ],
      },
    });
    expect(input).toMatchObject({
      patientId: 'p1',
      serviceDate: '2026-10-01',
      amounts: [100, 50],
      clinicNpi: '1234567893',
    });
  });
});

describe('validateClaimInput — floating point charges', () => {
  it('does not flag two-decimal charges that are inexact in binary', () => {
    expect(validateClaimInput({ ...valid, amounts: [0.29, 19.99] }, NOW).valid).toBe(true);
  });
});
