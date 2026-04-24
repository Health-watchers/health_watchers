export interface PaymentResponse {
  id: string;
  intentId: string;
  patientId?: string;
  amount: string;
  assetCode: string;
  assetIssuer?: string;
  destination: string;
  memo?: string;
  status: string;
  txHash?: string;
  confirmedAt?: string;
  createdAt: string;
  updatedAt: string;
  sourceAssetCode?: string;
  sourceAssetIssuer?: string;
  destinationAmount?: string;
  maxSourceAmount?: string;
  path?: string[];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function toPaymentResponse(doc: any): PaymentResponse {
  return {
    id: String(doc._id),
    intentId: doc.intentId,
    patientId: doc.patientId ? String(doc.patientId) : undefined,
    amount: doc.amount,
    assetCode: doc.assetCode || 'XLM',
    assetIssuer: doc.assetIssuer ?? undefined,
    destination: doc.destination,
    memo: doc.memo,
    status: doc.status,
    txHash: doc.txHash,
    confirmedAt: doc.confirmedAt instanceof Date ? doc.confirmedAt.toISOString() : doc.confirmedAt,
    createdAt: doc.createdAt instanceof Date ? doc.createdAt.toISOString() : doc.createdAt,
    updatedAt: doc.updatedAt instanceof Date ? doc.updatedAt.toISOString() : doc.updatedAt,
    sourceAssetCode: doc.sourceAssetCode,
    sourceAssetIssuer: doc.sourceAssetIssuer ?? undefined,
    destinationAmount: doc.destinationAmount,
    maxSourceAmount: doc.maxSourceAmount,
    path: doc.path,
  };
}
