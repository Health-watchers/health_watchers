/**
 * receipt-pdf.service.ts
 *
 * Builds a payment receipt payload suitable for PDF rendering.
 * Actual PDF bytes are produced by the existing PDF infrastructure
 * (pass receiptData to your PDF renderer — PDFKit, Puppeteer, etc.).
 *
 * The QR code URL points to Stellar Expert for public transaction verification.
 */

export interface ClinicBranding {
  name: string;
  address: string;
  logoUrl?: string;
  phone?: string;
  email?: string;
}

export interface PaymentReceiptInput {
  paymentId: string;
  stellarTxHash: string;
  stellarNetwork: 'public' | 'testnet';
  amount: string;
  asset: string;
  paidAt: Date;
  patientName: string;
  patientId: string;
  clinicBranding: ClinicBranding;
  description?: string;
}

export interface ReceiptPayload {
  receiptId: string;
  qrCodeUrl: string;
  explorerUrl: string;
  branding: ClinicBranding;
  payment: {
    id: string;
    amount: string;
    asset: string;
    paidAt: string;
    txHash: string;
    description?: string;
  };
  patient: {
    id: string;
    name: string;
  };
  generatedAt: string;
}

/**
 * Returns the Stellar Expert URL for a transaction — used as QR code target.
 */
export function buildStellarExplorerUrl(
  txHash: string,
  network: 'public' | 'testnet',
): string {
  const base =
    network === 'public'
      ? 'https://stellar.expert/explorer/public/tx'
      : 'https://stellar.expert/explorer/testnet/tx';
  return `${base}/${txHash}`;
}

/**
 * Builds the full receipt payload.
 * Pass `payload.qrCodeUrl` to a QR code library to render the QR image.
 */
export function buildReceiptPayload(input: PaymentReceiptInput): ReceiptPayload {
  const explorerUrl = buildStellarExplorerUrl(input.stellarTxHash, input.stellarNetwork);

  return {
    receiptId: `RCT-${input.paymentId}`,
    qrCodeUrl: explorerUrl,   // QR code encodes this URL
    explorerUrl,
    branding: input.clinicBranding,
    payment: {
      id:          input.paymentId,
      amount:      input.amount,
      asset:       input.asset,
      paidAt:      input.paidAt.toISOString(),
      txHash:      input.stellarTxHash,
      description: input.description,
    },
    patient: {
      id:   input.patientId,
      name: input.patientName,
    },
    generatedAt: new Date().toISOString(),
  };
}
