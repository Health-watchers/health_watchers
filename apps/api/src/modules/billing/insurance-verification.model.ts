import mongoose, { Schema, Document, Types } from 'mongoose';

export type InsuranceVerificationStatus = 'in_progress' | 'verified' | 'not_verified' | 'error';

export interface ICoverageDetails {
  isActive: boolean;
  effectiveDate?: string;
  expirationDate?: string;
  coverageType?: string;
  copay?: string;
  deductible?: string;
  deductibleMet?: string;
  coinsurance?: string;
  coveragePercentage?: number;
  outOfPocketMax?: string;
  notes?: string;
}

export interface IInsuranceVerification extends Document {
  clinicId: Types.ObjectId;
  patientId: Types.ObjectId;
  invoiceId?: Types.ObjectId;
  insuranceId?: Types.ObjectId;
  provider: string;
  memberId: string;
  /** Masked policy number, e.g. ****1234 — the full PHI value lives on the patient record. */
  policyNumber: string;
  status: InsuranceVerificationStatus;
  coverageDetails?: ICoverageDetails;
  rawResponse?: Record<string, unknown>;
  requestId: string;
  requestedBy: string;
  requestedAt: Date;
  verifiedAt?: Date;
  expiresAt?: Date;
}

const CoverageDetailsSchema = new Schema<ICoverageDetails>(
  {
    isActive: { type: Boolean, default: false },
    effectiveDate: { type: String },
    expirationDate: { type: String },
    coverageType: { type: String },
    copay: { type: String },
    deductible: { type: String },
    deductibleMet: { type: String },
    coinsurance: { type: String },
    coveragePercentage: { type: Number },
    outOfPocketMax: { type: String },
    notes: { type: String },
  },
  { _id: false }
);

const InsuranceVerificationSchema = new Schema<IInsuranceVerification>(
  {
    clinicId: { type: Schema.Types.ObjectId, ref: 'Clinic', required: true, index: true },
    patientId: { type: Schema.Types.ObjectId, ref: 'Patient', required: true, index: true },
    invoiceId: { type: Schema.Types.ObjectId, ref: 'Invoice' },
    insuranceId: { type: Schema.Types.ObjectId },
    provider: { type: String, required: true, trim: true },
    memberId: { type: String, required: true },
    policyNumber: { type: String, required: true },
    status: {
      type: String,
      enum: ['in_progress', 'verified', 'not_verified', 'error'],
      default: 'in_progress',
      index: true,
    },
    coverageDetails: { type: CoverageDetailsSchema },
    rawResponse: { type: Schema.Types.Mixed },
    requestId: { type: String, required: true, unique: true },
    requestedBy: { type: String, required: true },
    requestedAt: { type: Date, default: Date.now },
    verifiedAt: { type: Date },
    expiresAt: { type: Date },
  },
  { timestamps: true, versionKey: false }
);

InsuranceVerificationSchema.index({ clinicId: 1, createdAt: -1 });
InsuranceVerificationSchema.index({ patientId: 1, createdAt: -1 });
InsuranceVerificationSchema.index({ patientId: 1, status: 1 });

export const InsuranceVerificationModel = (mongoose.models.InsuranceVerification ||
  mongoose.model<IInsuranceVerification>(
    'InsuranceVerification',
    InsuranceVerificationSchema
  )) as import('mongoose').Model<IInsuranceVerification>;
