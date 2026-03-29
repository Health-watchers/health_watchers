import { Document } from 'mongoose';
import { PaymentRecord } from './models/payment-record.model';

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
}

export function toPaymentResponse(
  doc: Document<unknown, unknown, PaymentRecord> & PaymentRecord,
): PaymentResponse {
  return {
    id: String(doc._id),
    intentId: doc.intentId,
    patientId: doc.patientId ? String(doc.patientId) : undefined,
    amount: doc.amount,
    assetCode: doc.assetCode || 'XLM',
    assetIssuer: doc.assetIssuer ?? undefined,
    destination: doc.destination,
    memo:        doc.memo,
    status:      doc.status,
    txHash:      doc.txHash,
    confirmedAt: doc.confirmedAt instanceof Date ? doc.confirmedAt.toISOString() : doc.confirmedAt,
    createdAt:   doc.createdAt instanceof Date ? doc.createdAt.toISOString() : doc.createdAt,
    updatedAt:   doc.updatedAt instanceof Date ? doc.updatedAt.toISOString() : doc.updatedAt,
    memo: doc.memo,
    status: doc.status,
    txHash: doc.txHash,
    createdAt: doc.createdAt instanceof Date ? doc.createdAt.toISOString() : doc.createdAt,
    updatedAt: doc.updatedAt instanceof Date ? doc.updatedAt.toISOString() : doc.updatedAt,
  };
}
