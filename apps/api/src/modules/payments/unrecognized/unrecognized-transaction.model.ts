import mongoose, { Document, Schema } from 'mongoose';

export interface IUnrecognizedTransaction extends Document {
  stellarTxHash: string;
  fromAddress: string;
  toAddress: string;
  amount: string;
  asset: string;
  detectedAt: Date;
  resolved: boolean;
  resolvedAt?: Date;
  resolvedBy?: mongoose.Types.ObjectId;
  clinicId: mongoose.Types.ObjectId;
}

const UnrecognizedTransactionSchema = new Schema<IUnrecognizedTransaction>(
  {
    stellarTxHash: { type: String, required: true, unique: true },
    fromAddress: { type: String, required: true },
    toAddress: { type: String, required: true },
    amount: { type: String, required: true },
    asset: { type: String, required: true, default: 'XLM' },
    detectedAt: { type: Date, required: true, default: Date.now },
    resolved: { type: Boolean, default: false, index: true },
    resolvedAt: Date,
    resolvedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    clinicId: { type: Schema.Types.ObjectId, ref: 'Clinic', required: true, index: true },
  },
  { timestamps: true },
);

export const UnrecognizedTransactionModel = mongoose.model<IUnrecognizedTransaction>(
  'UnrecognizedTransaction',
  UnrecognizedTransactionSchema,
);
