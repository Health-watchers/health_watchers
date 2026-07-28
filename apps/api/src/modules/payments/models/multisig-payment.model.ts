import { Schema, Types, model, models } from 'mongoose';

export interface IMultiSigPayment {
  paymentId: Types.ObjectId;
  clinicId: Types.ObjectId;
  amount: number;
  currency: string;
  requiredSignatures: number;
  signers: string[];
  signatures: Array<{
    signer: string;
    signature: string;
    signedAt: Date;
  }>;
  status: 'pending' | 'ready_for_submission' | 'submitted' | 'confirmed' | 'failed';
}

const multiSigPaymentSchema = new Schema<IMultiSigPayment>(
  {
    paymentId: { type: Schema.Types.ObjectId, ref: 'PaymentRecord', required: true, unique: true },
    clinicId: { type: Schema.Types.ObjectId, ref: 'Clinic', required: true, index: true },
    amount: { type: Number, required: true },
    currency: { type: String, required: true },
    requiredSignatures: { type: Number, required: true, min: 2 },
    signers: [{ type: String, required: true }],
    signatures: [
      {
        signer: { type: String, required: true },
        signature: { type: String, required: true },
        signedAt: { type: Date, required: true },
      },
    ],
    status: {
      type: String,
      enum: ['pending', 'ready_for_submission', 'submitted', 'confirmed', 'failed'],
      default: 'pending',
    },
  },
  { timestamps: true, versionKey: false }
);

multiSigPaymentSchema.index({ clinicId: 1, status: 1 });
multiSigPaymentSchema.index({ signers: 1, status: 1 });

export const MultiSigPaymentModel = (models.MultiSigPayment ||
  model<IMultiSigPayment>(
    'MultiSigPayment',
    multiSigPaymentSchema
  )) as import('mongoose').Model<IMultiSigPayment>;
