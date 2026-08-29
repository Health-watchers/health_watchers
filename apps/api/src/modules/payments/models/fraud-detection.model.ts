import { Schema, model, models } from 'mongoose';

export interface IFraudAlert {
  paymentIntentId: string;
  clinicId: string;
  fraudScore: number;
  riskFactors: string[];
  status: 'pending' | 'approved' | 'rejected';
  reviewedBy?: string;
  reviewedAt?: Date;
  notes?: string;
}

const fraudAlertSchema = new Schema<IFraudAlert>(
  {
    paymentIntentId: { type: String, required: true, unique: true, index: true },
    clinicId: { type: String, required: true, index: true },
    fraudScore: { type: Number, required: true, min: 0, max: 100 },
    riskFactors: { type: [String], default: [] },
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'pending',
      index: true,
    },
    reviewedBy: { type: String },
    reviewedAt: { type: Date },
    notes: { type: String },
  },
  { timestamps: true, versionKey: false }
);

fraudAlertSchema.index({ clinicId: 1, status: 1 });
fraudAlertSchema.index({ createdAt: 1 });

export const FraudAlertModel = (models.FraudAlert ||
  model<IFraudAlert>('FraudAlert', fraudAlertSchema)) as import('mongoose').Model<IFraudAlert>;
