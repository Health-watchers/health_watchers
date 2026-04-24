import { Schema, model, models } from 'mongoose';

export interface PaymentRecord {
  intentId: string;
  amount: string;
  destination: string;
  memo?: string;
  status: 'pending' | 'confirmed' | 'failed';
  txHash?: string;
  confirmedAt?: Date;
  clinicId: string;
  patientId?: string;
  assetCode: string;
  assetIssuer?: string | null;
  // Path payment fields
  sourceAssetCode?: string;
  sourceAssetIssuer?: string | null;
  destinationAmount?: string;
  maxSourceAmount?: string;
  path?: string[];
  feeStrategy?: 'slow' | 'standard' | 'fast';
}

const paymentRecordSchema = new Schema<PaymentRecord>(
  {
    intentId: { type: String, required: true, unique: true },
    amount: { type: String, required: true },
    destination: { type: String, required: true },
    memo: { type: String, index: true },
    status: {
      type: String,
      enum: ['pending', 'confirmed', 'failed'],
      default: 'pending',
      index: true,
    },
    txHash: { type: String, index: true },
    confirmedAt: { type: Date },
    clinicId: { type: String, required: true, index: true },
    patientId: { type: String, index: true },
    assetCode: { type: String, required: true, default: 'XLM', uppercase: true, trim: true },
    assetIssuer: { type: String, default: null },
    // Path payment fields
    sourceAssetCode: { type: String, uppercase: true, trim: true },
    sourceAssetIssuer: { type: String, default: null },
    destinationAmount: { type: String },
    maxSourceAmount: { type: String },
    path: { type: [String], default: undefined },
    feeStrategy: { type: String, enum: ['slow', 'standard', 'fast'], default: 'standard' },
  },
  { timestamps: true, versionKey: false }
);

paymentRecordSchema.index({ status: 1, createdAt: 1 });
paymentRecordSchema.index({ memo: 1, clinicId: 1 });

export const PaymentRecordModel =
  models.PaymentRecord || model<PaymentRecord>('PaymentRecord', paymentRecordSchema);
