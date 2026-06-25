import mongoose, { Document, Schema } from 'mongoose';

export type ClaimStatus =
  | 'draft'
  | 'submitted'
  | 'accepted'
  | 'rejected'
  | 'paid'
  | 'resubmitted';

export interface IInsuranceClaim extends Document {
  encounterId: mongoose.Types.ObjectId;
  patientId: mongoose.Types.ObjectId;
  clinicId: mongoose.Types.ObjectId;
  cptCodes: string[];
  diagnosisCodes: string[];
  totalAmount: number;
  status: ClaimStatus;
  cms1500Data: Record<string, unknown>;
  edi837Data?: string;
  submittedAt?: Date;
  rejectionReason?: string;
  resubmissionCount: number;
}

const InsuranceClaimSchema = new Schema<IInsuranceClaim>(
  {
    encounterId:      { type: Schema.Types.ObjectId, ref: 'Encounter', required: true, index: true },
    patientId:        { type: Schema.Types.ObjectId, ref: 'Patient',   required: true, index: true },
    clinicId:         { type: Schema.Types.ObjectId, ref: 'Clinic',    required: true },
    cptCodes:         [{ type: String, required: true }],
    diagnosisCodes:   [{ type: String }],
    totalAmount:      { type: Number, required: true, min: 0 },
    status:           { type: String, enum: ['draft','submitted','accepted','rejected','paid','resubmitted'], default: 'draft' },
    cms1500Data:      { type: Schema.Types.Mixed, required: true },
    edi837Data:       { type: String },
    submittedAt:      { type: Date },
    rejectionReason:  { type: String },
    resubmissionCount:{ type: Number, default: 0 },
  },
  { timestamps: true },
);

export const InsuranceClaimModel = mongoose.model<IInsuranceClaim>(
  'InsuranceClaim',
  InsuranceClaimSchema,
);
