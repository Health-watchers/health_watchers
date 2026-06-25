import mongoose, { Schema, Document } from 'mongoose';

export type DisputeReason = 'duplicate_payment' | 'service_not_rendered' | 'incorrect_amount' | 'other';
export type DisputeStatus =
  | 'open'
  | 'evidence_submitted'
  | 'under_review'
  | 'resolved_refund'
  | 'resolved_no_action'
  | 'closed';

/** Outcome of a resolved dispute. `patient_favored` triggers automatic refund processing. */
export type DisputeOutcome = 'patient_favored' | 'clinic_favored' | 'no_action';

/** A single piece of evidence attached to a dispute. */
export interface IDisputeEvidence {
  description: string;
  attachmentUrl?: string;
  submittedBy: string;
  submittedAt: Date;
}

/** Structured resolution record. */
export interface IDisputeResolution {
  outcome: DisputeOutcome;
  notes?: string;
  resolvedBy: string;
  resolvedAt: Date;
  refundIntentId?: string;
  refundAmount?: string;
}

export interface IPaymentDispute extends Document {
  paymentIntentId: string;
  clinicId: string;
  patientId: string;
  reason: DisputeReason;
  description: string;
  status: DisputeStatus;
  openedBy: string;
  openedAt: Date;
  // ── Evidence & review period ──
  evidence: IDisputeEvidence[];
  evidenceSubmittedAt?: Date;
  reviewDeadline?: Date;
  // ── Resolution ──
  resolution?: IDisputeResolution;
  resolvedBy?: string;
  resolvedAt?: Date;
  resolutionNotes?: string;
  refundIntentId?: string;
}

const EvidenceSchema = new Schema<IDisputeEvidence>(
  {
    description:   { type: String, required: true },
    attachmentUrl: { type: String },
    submittedBy:   { type: String, required: true },
    submittedAt:   { type: Date, default: Date.now },
  },
  { _id: false },
);

const ResolutionSchema = new Schema<IDisputeResolution>(
  {
    outcome:        { type: String, enum: ['patient_favored', 'clinic_favored', 'no_action'], required: true },
    notes:          { type: String },
    resolvedBy:     { type: String, required: true },
    resolvedAt:     { type: Date, default: Date.now },
    refundIntentId: { type: String },
    refundAmount:   { type: String },
  },
  { _id: false },
);

const PaymentDisputeSchema = new Schema<IPaymentDispute>(
  {
    paymentIntentId: { type: String, required: true, index: true },
    clinicId:        { type: String, required: true },
    patientId:       { type: String, required: true },
    reason:          { type: String, enum: ['duplicate_payment','service_not_rendered','incorrect_amount','other'], required: true },
    description:     { type: String, required: true },
    status:          { type: String, enum: ['open','evidence_submitted','under_review','resolved_refund','resolved_no_action','closed'], default: 'open' },
    openedBy:        { type: String, required: true },
    openedAt:        { type: Date, default: Date.now },
    evidence:            { type: [EvidenceSchema], default: [] },
    evidenceSubmittedAt: { type: Date },
    reviewDeadline:      { type: Date },
    resolution:      { type: ResolutionSchema },
    resolvedBy:      { type: String },
    resolvedAt:      { type: Date },
    resolutionNotes: { type: String },
    refundIntentId:  { type: String },
  },
  { timestamps: true }
);

export const PaymentDisputeModel = mongoose.model<IPaymentDispute>('PaymentDispute', PaymentDisputeSchema);
