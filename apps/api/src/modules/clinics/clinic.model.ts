import { Schema, Types, model, models } from 'mongoose';

export interface IClinic {
  name: string;
  address: string;
  phone: string;
  email: string;
  stellarPublicKey?: string;
  subscriptionTier: 'free' | 'basic' | 'premium';
  isActive: boolean;
  createdBy: Types.ObjectId;
  onboardingStep: number;
  onboardingCompleted: boolean;
  onboardingCompletedAt?: Date;
}

const clinicSchema = new Schema<IClinic>(
  {
    name: { type: String, required: true, trim: true },
    address: { type: String, required: true, trim: true },
    phone: { type: String, required: true, trim: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    stellarPublicKey: { type: String, sparse: true, index: true },
    subscriptionTier: { type: String, enum: ['free', 'basic', 'premium'], default: 'free' },
    isActive: { type: Boolean, default: true, index: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    onboardingStep: { type: Number, default: 1, min: 1, max: 5 },
    onboardingCompleted: { type: Boolean, default: false, index: true },
    onboardingCompletedAt: { type: Date },
  },
  { timestamps: true, versionKey: false }
);

export const ClinicModel = models.Clinic || model<IClinic>('Clinic', clinicSchema);
