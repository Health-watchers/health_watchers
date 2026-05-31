import { buildStellarExplorerUrl, buildReceiptPayload } from '../receipt-pdf.service';

const sampleInput = {
  paymentId:       'pay_001',
  stellarTxHash:   'abc123def456',
  stellarNetwork:  'public' as const,
  amount:          '150.00',
  asset:           'USDC',
  paidAt:          new Date('2024-03-15T10:00:00Z'),
  patientName:     'Jane Doe',
  patientId:       'pat_001',
  clinicBranding:  {
    name:    'Health Clinic',
    address: '123 Main St, Abuja',
    phone:   '+234 800 0000',
    email:   'billing@clinic.com',
  },
  description: 'Consultation fee',
};

describe('buildStellarExplorerUrl', () => {
  it('builds public network URL', () => {
    const url = buildStellarExplorerUrl('abc123', 'public');
    expect(url).toBe('https://stellar.expert/explorer/public/tx/abc123');
  });

  it('builds testnet URL', () => {
    const url = buildStellarExplorerUrl('abc123', 'testnet');
    expect(url).toBe('https://stellar.expert/explorer/testnet/tx/abc123');
  });

  it('includes tx hash in URL', () => {
    const url = buildStellarExplorerUrl('uniquehash99', 'public');
    expect(url).toContain('uniquehash99');
  });
});

describe('buildReceiptPayload', () => {
  it('generates receipt with correct payment fields', () => {
    const payload = buildReceiptPayload(sampleInput);
    expect(payload.payment.id).toBe('pay_001');
    expect(payload.payment.amount).toBe('150.00');
    expect(payload.payment.asset).toBe('USDC');
    expect(payload.payment.txHash).toBe('abc123def456');
  });

  it('includes QR code URL pointing to Stellar Explorer', () => {
    const payload = buildReceiptPayload(sampleInput);
    expect(payload.qrCodeUrl).toContain('stellar.expert');
    expect(payload.qrCodeUrl).toContain('abc123def456');
  });

  it('includes clinic branding', () => {
    const payload = buildReceiptPayload(sampleInput);
    expect(payload.branding.name).toBe('Health Clinic');
    expect(payload.branding.address).toBe('123 Main St, Abuja');
  });

  it('includes patient information', () => {
    const payload = buildReceiptPayload(sampleInput);
    expect(payload.patient.name).toBe('Jane Doe');
    expect(payload.patient.id).toBe('pat_001');
  });

  it('receipt ID prefixed with RCT-', () => {
    const payload = buildReceiptPayload(sampleInput);
    expect(payload.receiptId).toBe('RCT-pay_001');
  });
});
