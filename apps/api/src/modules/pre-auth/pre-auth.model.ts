import { Schema, model, models } from 'mongoose';

export interface IPreAuth {
  patientId: Schema.Types.ObjectId;
  clinicId: Schema.Types.ObjectId;
  encounterId?: Schema.Types.ObjectId;
  procedureCode: string; // CPT code
  estimatedAmount: string;
  insuranceProvider: string;
  preAuthNumber?: string; // assigned by insurance on approval
  status: 'pending' | 'approved' | 'denied' | 'claimed' | 'reclaimed';
  claimableBalanceId?: string;
  approvedAt?: Date;
  claimedAt?: Date;
  expiresAt: Date; // 30 days from creation
}

const preAuthSchema = new Schema<IPreAuth>(
  {
    patientId: { type: Schema.Types.ObjectId, ref: 'Patient', required: true, index: true },
    clinicId: { type: Schema.Types.ObjectId, ref: 'Clinic', required: true, index: true },
    encounterId: { type: Schema.Types.ObjectId, ref: 'Encounter', index: true },
    procedureCode: { type: String, required: true, trim: true, index: true },
    estimatedAmount: { type: String, required: true },
    insuranceProvider: { type: String, required: true, trim: true },
    preAuthNumber: { type: String, trim: true },
    status: {
      type: String,
      enum: ['pending', 'approved', 'denied', 'claimed', 'reclaimed'],
      default: 'pending',
      index: true,
    },
    claimableBalanceId: { type: String, index: true },
    approvedAt: { type: Date },
    claimedAt: { type: Date },
    expiresAt: { type: Date, required: true, index: true },
  },
  { timestamps: true, versionKey: false }
);

preAuthSchema.index({ clinicId: 1, status: 1 });
preAuthSchema.index({ clinicId: 1, createdAt: -1 });

export const PreAuthModel = models.PreAuth || model<IPreAuth>('PreAuth', preAuthSchema);
