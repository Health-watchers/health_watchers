import { generateCms1500Pdf } from '../cms1500-pdf.service';

describe('generateCms1500Pdf', () => {
  it('renders a PDF document', async () => {
    const pdf = await generateCms1500Pdf({
      claimId: 'claim1',
      data: {
        box2_patientName: 'Doe, John',
        box3_patientDob: '1980-05-15',
        box21_diagnosisCodes: ['Z00.00', 'I10'],
        box24_servicelines: [
          { dateOfService: '2026-10-01', placeOfService: '11', cptCode: '99213', charges: 150, units: 1 },
        ],
        box28_totalCharge: 150,
        box33_billingProviderNpi: '1234567893',
      },
    });
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(pdf.length).toBeGreaterThan(1000);
  });

  it('handles more than six service lines and twelve diagnoses without throwing', async () => {
    const pdf = await generateCms1500Pdf({
      claimId: 'claim2',
      submissionLabel: 'CORRECTED (7) #1',
      data: {
        box21_diagnosisCodes: Array.from({ length: 15 }, (_, i) => `A0${i % 10}`),
        box24_servicelines: Array.from({ length: 8 }, () => ({ cptCode: '99213', charges: 10 })),
      },
    });
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
  });
});
