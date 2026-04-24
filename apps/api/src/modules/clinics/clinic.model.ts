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
  },
  { timestamps: true, versionKey: false }
);

export const ClinicModel = models.Clinic || model<IClinic>('Clinic', clinicSchema);
