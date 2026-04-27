import { Schema, Types, model, models } from 'mongoose';

export interface IClinicKeypair {
  clinicId: Types.ObjectId;
  publicKey: string;
  encryptedSecretKey: string;
  iv: string;
  keyVersion: number;
  isActive: boolean;
  createdAt: Date;
}

const clinicKeypairSchema = new Schema<IClinicKeypair>(
  {
    clinicId:           { type: Schema.Types.ObjectId, ref: 'Clinic', required: true, index: true },
    publicKey:          { type: String, required: true },
    encryptedSecretKey: { type: String, required: true },
    iv:                 { type: String, required: true },
    keyVersion:         { type: Number, required: true, default: 1 },
    isActive:           { type: Boolean, default: true, index: true },
  },
  { timestamps: true, versionKey: false },
);

export const ClinicKeypairModel = models.ClinicKeypair || model<IClinicKeypair>('ClinicKeypair', clinicKeypairSchema);
