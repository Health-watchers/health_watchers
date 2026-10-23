import mongoose, { Document, Schema } from 'mongoose';
import { baseSchema } from '@api/shared';

export type ClaimStatus =
  | 'draft'
  | 'submitted'
  | 'accepted'
  | 'rejected'
  | 'denied'
  | 'paid'
  | 'resubmitted'
  | 'written_off';

export const CLAIM_STATUSES: ClaimStatus[] = [
  'draft',
  'submitted',
  'accepted',
  'rejected',
  'denied',
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

export type ClearinghouseProvider = 'availity' | 'change_healthcare' | 'mock';

export interface ClaimClearinghouseInfo {
  provider: ClearinghouseProvider;
  /** Clearinghouse-assigned tracking / batch id */
  submissionId?: string;
  /** Payer claim control number (ICN/DCN) once the payer accepts the claim */
  payerClaimId?: string;
  lastStatus?: string;
  lastCheckedAt?: Date;
}

/** Claim Adjustment Reason Code adjustment from an 835 remittance */
export interface RemittanceAdjustment {
  /** CAS group code: CO (contractual), PR (patient responsibility), OA, PI, CR */
  groupCode: 'CO' | 'PR' | 'OA' | 'PI' | 'CR';
  /** CARC, e.g. "45" */
  reasonCode: string;
  amount: number;
  /** Remittance Advice Remark Code, e.g. "N130" */
  remarkCode?: string;
}

/** Electronic Remittance Advice (ANSI X12 835) entry for this claim */
export interface ClaimRemittance {
  _id?: mongoose.Types.ObjectId;
  eraId: string;
  payerName?: string;
  checkNumber?: string;
  paymentMethod?: 'ACH' | 'CHK' | 'NON';
  /** Claim status code from CLP02: 1 processed as primary, 4 denied, 22 reversal … */
  claimStatusCode?: string;
  billedAmount: number;
  allowedAmount?: number;
  paidAmount: number;
  patientResponsibility: number;
  adjustments: RemittanceAdjustment[];
  receivedAt: Date;
  postedAt?: Date;
}

export interface ClaimCorrection {
  at: Date;
  by?: mongoose.Types.ObjectId;
  note?: string;
  changes: Record<string, { from: unknown; to: unknown }>;
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
  clearinghouse?: ClaimClearinghouseInfo;
  remittances: ClaimRemittance[];
  /** Sum of payer payments across remittances */
  paidAmount: number;
  paidAt?: Date;
  acceptedAt?: Date;
  denialReason?: string;
  corrections: ClaimCorrection[];
  isActive: boolean;
  createdBy: mongoose.Types.ObjectId;
}

const InsuranceClaimSchema = new Schema<IInsuranceClaim>(
  {
    encounterId: { type: Schema.Types.ObjectId, ref: 'Encounter', required: true, index: true },
    patientId: { type: Schema.Types.ObjectId, ref: 'Patient', required: true, index: true },
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
    clearinghouse: {
      provider: { type: String, enum: ['availity', 'change_healthcare', 'mock'] },
      submissionId: { type: String, index: true },
      payerClaimId: { type: String },
      lastStatus: { type: String },
      lastCheckedAt: { type: Date },
    },
    remittances: [
      {
        eraId: { type: String, required: true },
        payerName: { type: String },
        checkNumber: { type: String },
        paymentMethod: { type: String, enum: ['ACH', 'CHK', 'NON'] },
        claimStatusCode: { type: String },
        billedAmount: { type: Number, required: true, min: 0 },
        allowedAmount: { type: Number, min: 0 },
        paidAmount: { type: Number, required: true },
        patientResponsibility: { type: Number, default: 0 },
        adjustments: [
          {
            _id: false,
            groupCode: { type: String, enum: ['CO', 'PR', 'OA', 'PI', 'CR'], required: true },
            reasonCode: { type: String, required: true },
            amount: { type: Number, required: true },
            remarkCode: { type: String },
          },
        ],
        receivedAt: { type: Date, default: () => new Date() },
        postedAt: { type: Date },
      },
    ],
    paidAmount: { type: Number, default: 0 },
    paidAt: { type: Date },
    acceptedAt: { type: Date },
    denialReason: { type: String },
    corrections: [
      {
        _id: false,
        at: { type: Date, default: () => new Date() },
        by: { type: Schema.Types.ObjectId, ref: 'User' },
        note: { type: String },
        changes: { type: Schema.Types.Mixed },
      },
    ],
  },
  { timestamps: true }
);

InsuranceClaimSchema.add(baseSchema);

InsuranceClaimSchema.index({ clinicId: 1, status: 1, createdAt: -1 });
InsuranceClaimSchema.index({ clinicId: 1, 'remittances.receivedAt': -1 });

export const InsuranceClaimModel = mongoose.model<IInsuranceClaim>(
  'InsuranceClaim',
  InsuranceClaimSchema
);
