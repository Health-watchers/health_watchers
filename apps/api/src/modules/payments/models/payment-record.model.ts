import { Schema, model, models } from 'mongoose';

export interface PaymentRecord {
  intentId: string;
  amount: string;
  destination: string;
  memo?: string;
  status: 'pending' | 'confirmed' | 'failed';
  txHash?: string;
  clinicId: string;
  patientId?: string;
}

const paymentRecordSchema = new Schema<PaymentRecord>(
  {
    intentId:    { type: String, required: true, unique: true },
    amount:      { type: String, required: true },
    destination: { type: String, required: true },
    memo:        { type: String },
    status:      { type: String, enum: ['pending', 'confirmed', 'failed'], default: 'pending' },
    txHash:      { type: String },
    clinicId:    { type: String, required: true, index: true },
    patientId:   { type: String, index: true },
    assetCode:   { type: String, required: true, default: 'XLM', uppercase: true, trim: true },
    assetIssuer: { type: String, default: null }, // null for native XLM
  },
  { timestamps: true, versionKey: false },
);

export const PaymentRecordModel =
  models.PaymentRecord || model<PaymentRecord>('PaymentRecord', paymentRecordSchema);
