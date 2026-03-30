import { Schema, model, models } from 'mongoose';

export interface Clinic {
  name: string;
  stellarPublicKey: string;
  isActive: boolean;
  address?: string;
  contactEmail?: string;
  plan?: 'basic' | 'standard' | 'enterprise';
}

const clinicSchema = new Schema<Clinic>(
  {
    name: { type: String, required: true, trim: true },
    stellarPublicKey: { type: String, required: true, index: true, sparse: true },
    isActive: { type: Boolean, required: true, default: true, index: true },
    address: { type: String, trim: true },
    contactEmail: { type: String, lowercase: true, trim: true },
    plan: { type: String, enum: ['basic', 'standard', 'enterprise'], default: 'basic' },
  },
  { timestamps: true, versionKey: false },
);

export const ClinicModel = models.Clinic || model<Clinic>('Clinic', clinicSchema);
