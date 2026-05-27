import { Schema, model, models } from 'mongoose';
import crypto from 'crypto';

export interface InsuranceClaim {
  claimId: string;
  clinicId: string;
  patientId: string;
  encounterId?: string;
  procedureCodes: string[];
  diagnosisCodes: string[];
  claimAmount: string;
  currency: string;
  serviceDate: Date;
  submissionDate: Date;
  status: 'submitted' | 'under_review' | 'approved' | 'denied' | 'paid';
  claimHash: string; // SHA-256 of claim data
  stellarTxHash?: string; // Stellar transaction hash
  stellarTxMemo?: string; // Transaction memo: CLAIM:{claimId}
  insuranceCompany?: string;
  insuranceClaimNumber?: string;
  statusUpdates: Array<{
    status: string;
    timestamp: Date;
    notes?: string;
  }>;
  verificationData?: {
    verifiedAt?: Date;
    verifiedBy?: string;
    hashMatch?: boolean;
  };
}

const insuranceClaimSchema = new Schema<InsuranceClaim>(
  {
    claimId: { type: String, required: true, unique: true, index: true },
    clinicId: { type: String, required: true, index: true },
    patientId: { type: String, required: true, index: true },
    encounterId: { type: String, index: true },
    procedureCodes: { type: [String], default: [] },
    diagnosisCodes: { type: [String], default: [] },
    claimAmount: { type: String, required: true },
    currency: { type: String, default: 'USD' },
    serviceDate: { type: Date, required: true },
    submissionDate: { type: Date, default: () => new Date() },
    status: {
      type: String,
      enum: ['submitted', 'under_review', 'approved', 'denied', 'paid'],
      default: 'submitted',
      index: true,
    },
    claimHash: { type: String, required: true, index: true },
    stellarTxHash: { type: String, index: true },
    stellarTxMemo: { type: String },
    insuranceCompany: { type: String },
    insuranceClaimNumber: { type: String, index: true },
    statusUpdates: [
      {
        status: String,
        timestamp: { type: Date, default: () => new Date() },
        notes: String,
      },
    ],
    verificationData: {
      verifiedAt: Date,
      verifiedBy: String,
      hashMatch: Boolean,
    },
  },
  { timestamps: true, versionKey: false }
);

insuranceClaimSchema.index({ clinicId: 1, submissionDate: -1 });
insuranceClaimSchema.index({ status: 1, clinicId: 1 });
insuranceClaimSchema.index({ claimHash: 1, clinicId: 1 });

export const InsuranceClaimModel =
  models.InsuranceClaim || model<InsuranceClaim>('InsuranceClaim', insuranceClaimSchema);

/**
 * Calculate SHA-256 hash of claim data for blockchain verification
 */
export function calculateClaimHash(claim: {
  claimId: string;
  patientId: string;
  clinicId: string;
  procedureCodes: string[];
  diagnosisCodes: string[];
  claimAmount: string;
  currency: string;
  serviceDate: Date;
  submissionDate: Date;
}): string {
  const claimData = JSON.stringify({
    claimId: claim.claimId,
    patientId: claim.patientId,
    clinicId: claim.clinicId,
    procedureCodes: claim.procedureCodes.sort(),
    diagnosisCodes: claim.diagnosisCodes.sort(),
    claimAmount: claim.claimAmount,
    currency: claim.currency,
    serviceDate: claim.serviceDate.toISOString(),
    submissionDate: claim.submissionDate.toISOString(),
  });

  return crypto.createHash('sha256').update(claimData).digest('hex');
}
