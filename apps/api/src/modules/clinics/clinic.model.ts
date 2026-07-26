import { Schema, Types, model, models } from 'mongoose';

export interface SplitRatio {
  clinic: number; // percentage (0-100)
  doctor: number; // percentage (0-100)
}

export interface DoctorSplitOverride {
  doctorId: Types.ObjectId;
  splitRatio: SplitRatio;
}

export interface PaymentSplitConfig {
  splitEnabled: boolean;
  defaultSplitRatio: SplitRatio;
  doctorOverrides: DoctorSplitOverride[];
}

export interface IClinic {
  name: string;
  address: string;
  phone: string;
  email: string;
  stellarPublicKey?: string;
  federationAddress?: string;
  subscriptionTier: 'free' | 'basic' | 'premium';
  isActive: boolean;
  createdBy: Types.ObjectId;
  onboardingStep: number;
  onboardingCompleted: boolean;
  onboardingCompletedAt?: Date;
  paymentSplitConfig?: PaymentSplitConfig;
  contactNumber?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

const clinicSchema = new Schema<IClinic>(
  {
    name: { type: String, required: true, trim: true },
    address: { type: String, required: true, trim: true },
    phone: { type: String, required: true, trim: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    stellarPublicKey: { type: String, sparse: true, index: true },
    federationAddress: { type: String, sparse: true, unique: true, index: true },
    subscriptionTier: { type: String, enum: ['free', 'basic', 'premium'], default: 'free' },
    isActive: { type: Boolean, default: true, index: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    onboardingStep: { type: Number, default: 1, min: 1, max: 5 },
    onboardingCompleted: { type: Boolean, default: false, index: true },
    onboardingCompletedAt: { type: Date },
    paymentSplitConfig: {
      splitEnabled: { type: Boolean, default: false },
      defaultSplitRatio: {
        clinic: { type: Number, default: 70, min: 0, max: 100 },
        doctor: { type: Number, default: 30, min: 0, max: 100 },
      },
      doctorOverrides: [
        {
          doctorId: { type: Schema.Types.ObjectId, ref: 'User' },
          splitRatio: {
            clinic: { type: Number, min: 0, max: 100 },
            doctor: { type: Number, min: 0, max: 100 },
          },
        },
      ],
    },
  },
  { timestamps: true, versionKey: false }
);

export const ClinicModel = (models.Clinic ||
  model<IClinic>('Clinic', clinicSchema)) as import('mongoose').Model<IClinic>;
