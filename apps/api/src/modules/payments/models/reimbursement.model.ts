import mongoose, { Schema, Document } from 'mongoose';

export interface Reimbursement extends Document {
  claimId: string;
  clinicId: mongoose.Types.ObjectId;
  insuranceProvider: string;
  approvedAmount: string; // Stored as string to preserve precision
  currency: 'XLM' | 'USDC';
  reimbursementStatus: 'pending' | 'processing' | 'completed' | 'failed';
  insuranceStellarAddress: string;
  txHash?: string;
  reimbursedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const reimbursementSchema = new Schema<Reimbursement>(
  {
    claimId: { type: String, required: true, unique: true, index: true },
    clinicId: { type: Schema.Types.ObjectId, required: true, index: true },
    insuranceProvider: { type: String, required: true },
    approvedAmount: { type: String, required: true },
    currency: { type: String, enum: ['XLM', 'USDC'], default: 'XLM' },
    reimbursementStatus: {
      type: String,
      enum: ['pending', 'processing', 'completed', 'failed'],
      default: 'pending',
      index: true,
    },
    insuranceStellarAddress: { type: String, required: true },
    txHash: String,
    reimbursedAt: Date,
  },
  { timestamps: true }
);

export const ReimbursementModel = mongoose.model<Reimbursement>(
  'Reimbursement',
  reimbursementSchema
);
