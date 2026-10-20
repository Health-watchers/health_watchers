import mongoose, { Document, Schema } from 'mongoose';

export type ClaimStatus =
  | 'draft'
  | 'submitted'
  | 'accepted'
  | 'rejected'
  | 'paid'
  | 'resubmitted'
  | 'written_off';

export const CLAIM_STATUSES: ClaimStatus[] = [
  'draft',
  'submitted',
  'accepted',
  'rejected',
  'paid',
  'resubmitted',
  'written_off',
];

export interface ClaimStatusEvent {
  status: ClaimStatus;
  at: Date;
  by?: mongoose.Types.ObjectId;
  note?: string;
}

export interface ClaimAttachment {
  _id?: mongoose.Types.ObjectId;
  name: string;
  url: string;
  mimeType?: string;
  uploadedAt: Date;
  uploadedBy?: mongoose.Types.ObjectId;
}

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
  writeOffReason?: string;
  writtenOffAt?: Date;
  statusHistory: ClaimStatusEvent[];
  attachments: ClaimAttachment[];
}

const InsuranceClaimSchema = new Schema<IInsuranceClaim>(
  {
    encounterId: { type: Schema.Types.ObjectId, ref: 'Encounter', required: true, index: true },
    patientId: { type: Schema.Types.ObjectId, ref: 'Patient', required: true, index: true },
    clinicId: { type: Schema.Types.ObjectId, ref: 'Clinic', required: true },
    cptCodes: [{ type: String, required: true }],
    diagnosisCodes: [{ type: String }],
    totalAmount: { type: Number, required: true, min: 0 },
    status: {
      type: String,
      enum: CLAIM_STATUSES,
      default: 'draft',
      index: true,
    },
    cms1500Data: { type: Schema.Types.Mixed, required: true },
    edi837Data: { type: String },
    submittedAt: { type: Date },
    rejectionReason: { type: String },
    resubmissionCount: { type: Number, default: 0 },
    writeOffReason: { type: String },
    writtenOffAt: { type: Date },
    statusHistory: [
      {
        _id: false,
        status: { type: String, enum: CLAIM_STATUSES, required: true },
        at: { type: Date, default: () => new Date() },
        by: { type: Schema.Types.ObjectId, ref: 'User' },
        note: { type: String },
      },
    ],
    attachments: [
      {
        name: { type: String, required: true },
        url: { type: String, required: true },
        mimeType: { type: String },
        uploadedAt: { type: Date, default: () => new Date() },
        uploadedBy: { type: Schema.Types.ObjectId, ref: 'User' },
      },
    ],
  },
  { timestamps: true }
);

InsuranceClaimSchema.index({ clinicId: 1, status: 1, createdAt: -1 });

export const InsuranceClaimModel = mongoose.model<IInsuranceClaim>(
  'InsuranceClaim',
  InsuranceClaimSchema
);
