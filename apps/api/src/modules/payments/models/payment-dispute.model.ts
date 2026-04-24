import mongoose, { Schema, Document } from 'mongoose';

export type DisputeReason = 'duplicate_payment' | 'service_not_rendered' | 'incorrect_amount' | 'other';
export type DisputeStatus = 'open' | 'under_review' | 'resolved_refund' | 'resolved_no_action' | 'closed';

export interface IPaymentDispute extends Document {
  paymentIntentId: string;
  clinicId: string;
  patientId: string;
  reason: DisputeReason;
  description: string;
  status: DisputeStatus;
  openedBy: string;
  openedAt: Date;
  resolvedBy?: string;
  resolvedAt?: Date;
  resolutionNotes?: string;
  refundIntentId?: string;
}

const PaymentDisputeSchema = new Schema<IPaymentDispute>(
  {
    paymentIntentId: { type: String, required: true },
    clinicId:        { type: String, required: true },
    patientId:       { type: String, required: true },
    reason:          { type: String, enum: ['duplicate_payment','service_not_rendered','incorrect_amount','other'], required: true },
    description:     { type: String, required: true },
    status:          { type: String, enum: ['open','under_review','resolved_refund','resolved_no_action','closed'], default: 'open' },
    openedBy:        { type: String, required: true },
    openedAt:        { type: Date, default: Date.now },
    resolvedBy:      { type: String },
    resolvedAt:      { type: Date },
    resolutionNotes: { type: String },
    refundIntentId:  { type: String },
  },
  { timestamps: true }
);

export const PaymentDisputeModel = mongoose.model<IPaymentDispute>('PaymentDispute', PaymentDisputeSchema);
