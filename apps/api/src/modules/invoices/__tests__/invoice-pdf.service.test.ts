import { generateInvoicePDF } from '../invoice-pdf.service';

describe('generateInvoicePDF', () => {
  it('includes clinic branding fields in generated PDF output', async () => {
    const invoice = {
      invoiceNumber: 'INV-1001',
      clinicId: '000000000000000000000000',
      patientId: '000000000000000000000001',
      lineItems: [
        { description: 'Consultation', quantity: 1, unitPrice: '100.00', total: '100.00' },
      ],
      subtotal: '100.00',
      total: '100.00',
      currency: 'USDC',
      status: 'draft',
      dueDate: new Date('2026-01-05T00:00:00.000Z'),
      stellarMemo: 'INV-1001',
      stellarDestination: 'GABCDEFGHJKLMNOPQRSTUVWXYZ1234567',
    } as any;

    const pdfStream = await generateInvoicePDF({
      invoice,
      clinicName: 'Clinic Pro',
      clinicAddress: '123 Elm Street',
      clinicPhone: '+1 555-0123',
      clinicTaxId: '98-7654321',
      patientName: 'Jane Doe',
      qrCodeDataUrl: '',
      branding: {
        primaryColor: '#0078d4',
        address: '123 Elm Street',
        phone: '+1 555-0123',
        taxId: '98-7654321',
        headerText: 'Professional invoice services',
        footerText: 'Thank you for your business',
        // 1x1 transparent PNG data URL
        signatureUrl:
          'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGNgYAAAAAMAASsJTYQAAAAASUVORK5CYII=',
        signatureName: 'Dr. Sarah Lee',
        signatureTitle: 'Clinic Director',
      },
    });

    const chunks: Buffer[] = [];
    for await (const chunk of pdfStream) {
      chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
    }
    const pdfBuffer = Buffer.concat(chunks);

    expect(pdfBuffer.length).toBeGreaterThan(1000);
    expect(pdfBuffer.includes(Buffer.from('Clinic Pro'))).toBe(true);
    expect(pdfBuffer.includes(Buffer.from('Tax ID: 98-7654321'))).toBe(true);
    expect(pdfBuffer.includes(Buffer.from('Authorized signature:'))).toBe(true);
    expect(pdfBuffer.includes(Buffer.from('Dr. Sarah Lee'))).toBe(true);
    // PNG signature bytes should be embedded in the PDF
    const pngHeader = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(pdfBuffer.includes(pngHeader)).toBe(true);
  });
});
