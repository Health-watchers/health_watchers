import mongoose, { Schema, Document } from 'mongoose';

export interface IPaymentRecord extends Document {
  intentId: string;
  clinicId: string;
  amount: string;
  destination: string;
  memo: string;
  status: 'pending' | 'confirmed' | 'failed';
}

const PaymentRecordSchema = new Schema<IPaymentRecord>(
  {
    intentId: { type: String, required: true, unique: true },
    clinicId: { type: String, required: true },
    amount: { type: String, required: true },
    destination: { type: String, required: true },
    memo: { type: String, required: true },
    status: { type: String, enum: ['pending', 'confirmed', 'failed'], default: 'pending' },
  },
  { timestamps: true }
);

export const PaymentRecordModel = mongoose.model<IPaymentRecord>('PaymentRecord', PaymentRecordSchema);
