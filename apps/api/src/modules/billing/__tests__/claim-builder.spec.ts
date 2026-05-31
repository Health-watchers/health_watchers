import { buildCms1500, buildEdi837 } from '../claim-builder';

const baseInput = {
  encounterId: 'enc_001',
  patientId:   'pat_001',
  clinicId:    'cli_001',
  clinicNpi:   '1234567890',
  patientDob:  '1980-05-15',
  patientName: 'Doe, John',
  serviceDate: '2024-03-01',
  cptCodes:    ['99213', '93000'],
  diagnosisCodes: ['Z00.00', 'I10'],
  amounts:     [150.00, 75.00],
};

describe('buildCms1500', () => {
  it('generates required CMS-1500 fields', () => {
    const form = buildCms1500(baseInput);
    expect(form.box2_patientName).toBe('Doe, John');
    expect(form.box28_totalCharge).toBe(225.00);
    expect((form.box24_servicelines as any[]).length).toBe(2);
    expect(form.box33_billingProviderNpi).toBe('1234567890');
  });

  it('caps diagnosis codes at 12', () => {
    const input = { ...baseInput, diagnosisCodes: Array(15).fill('Z00.00') };
    const form = buildCms1500(input);
    expect((form.box21_diagnosisCodes as string[]).length).toBeLessThanOrEqual(12);
  });

  it('maps CPT codes to service lines', () => {
    const form = buildCms1500(baseInput);
    const lines = form.box24_servicelines as any[];
    expect(lines[0].cptCode).toBe('99213');
    expect(lines[1].cptCode).toBe('93000');
  });

  it('calculates total charge correctly', () => {
    const form = buildCms1500({ ...baseInput, amounts: [100, 200, 50] });
    expect(form.box28_totalCharge).toBe(350);
  });
});

describe('buildEdi837', () => {
  it('produces ISA segment header', () => {
    const edi = buildEdi837(baseInput);
    expect(edi).toContain('ISA*');
  });

  it('produces one SV1 line per CPT code', () => {
    const edi = buildEdi837(baseInput);
    const sv1Lines = edi.split('\n').filter(l => l.startsWith('SV1'));
    expect(sv1Lines.length).toBe(2);
  });

  it('includes clinic NPI in EDI', () => {
    const edi = buildEdi837(baseInput);
    expect(edi).toContain('1234567890');
  });
});
