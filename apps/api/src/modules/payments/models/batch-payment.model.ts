import { Schema, Types, model, models } from 'mongoose';

export type BatchPaymentStatus = 'pending' | 'submitted' | 'confirmed' | 'failed';

export interface PaymentInstruction {
  destination: string;
  amount: string;
  memo?: string;
}

export interface IBatchPayment {
  _id: Types.ObjectId;
  batchId: string;
  clinicId: Types.ObjectId;
  createdBy: Types.ObjectId;
  payments: PaymentInstruction[];
  status: BatchPaymentStatus;
  currency: string;
  totalAmount: string;
  txHash?: string;
  submittedAt?: Date;
  confirmedAt?: Date;
  failureReason?: string;
  createdAt: Date;
  updatedAt: Date;
}

const batchPaymentSchema = new Schema<IBatchPayment>(
  {
    batchId: { type: String, required: true, unique: true, index: true },
    clinicId: { type: Schema.Types.ObjectId, ref: 'Clinic', required: true, index: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    payments: [
      {
        destination: { type: String, required: true },
        amount: { type: String, required: true },
        memo: { type: String, required: false },
      },
    ],
    status: {
      type: String,
      enum: ['pending', 'submitted', 'confirmed', 'failed'],
      required: true,
      default: 'pending',
      index: true,
    },
    currency: { type: String, required: true },
    totalAmount: { type: String, required: true },
    txHash: { type: String, required: false, index: true },
    submittedAt: { type: Date, required: false },
    confirmedAt: { type: Date, required: false },
    failureReason: { type: String, required: false },
  },
  {
    timestamps: true,
    versionKey: false,
    collection: 'batch_payments',
  }
);

// Indexes
batchPaymentSchema.index({ clinicId: 1, status: 1 });
batchPaymentSchema.index({ clinicId: 1, createdAt: -1 });

export const BatchPaymentModel = (models.BatchPayment ||
  model<IBatchPayment>(
    'BatchPayment',
    batchPaymentSchema
  )) as import('mongoose').Model<IBatchPayment>;
