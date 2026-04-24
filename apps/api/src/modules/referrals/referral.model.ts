import mongoose, { Schema, Document } from 'mongoose';

export interface IReferral extends Document {
  fromClinicId: mongoose.Types.ObjectId;
  toClinicId: mongoose.Types.ObjectId;
  patientId: mongoose.Types.ObjectId;
  referredBy: mongoose.Types.ObjectId;
  reason: string;
  urgency: 'routine' | 'urgent' | 'emergency';
  encounterId?: mongoose.Types.ObjectId;
  sharedData: {
    demographics: boolean;
    encounters: boolean;
    labResults: boolean;
    prescriptions: boolean;
  };
  status: 'pending' | 'accepted' | 'declined' | 'completed';
  notes?: string;
  acceptedBy?: mongoose.Types.ObjectId;
  acceptedAt?: Date;
  declinedReason?: string;
}

const ReferralSchema = new Schema<IReferral>(
  {
    fromClinicId: { type: Schema.Types.ObjectId, ref: 'Clinic', required: true },
    toClinicId:   { type: Schema.Types.ObjectId, ref: 'Clinic', required: true },
    patientId:    { type: Schema.Types.ObjectId, ref: 'Patient', required: true },
    referredBy:   { type: Schema.Types.ObjectId, ref: 'User', required: true },
    reason:       { type: String, required: true },
    urgency:      { type: String, enum: ['routine', 'urgent', 'emergency'], required: true },
    encounterId:  { type: Schema.Types.ObjectId, ref: 'Encounter' },
    sharedData: {
      demographics:  { type: Boolean, default: false },
      encounters:    { type: Boolean, default: false },
      labResults:    { type: Boolean, default: false },
      prescriptions: { type: Boolean, default: false },
    },
    status:        { type: String, enum: ['pending', 'accepted', 'declined', 'completed'], default: 'pending' },
    notes:         { type: String },
    acceptedBy:    { type: Schema.Types.ObjectId, ref: 'User' },
    acceptedAt:    { type: Date },
    declinedReason:{ type: String },
  },
  { timestamps: true, versionKey: false },
);

ReferralSchema.index({ fromClinicId: 1, createdAt: -1 });
ReferralSchema.index({ toClinicId: 1, createdAt: -1 });
ReferralSchema.index({ patientId: 1, createdAt: -1 });
ReferralSchema.index({ status: 1 });

export const ReferralModel =
  mongoose.models.Referral || mongoose.model<IReferral>('Referral', ReferralSchema);
