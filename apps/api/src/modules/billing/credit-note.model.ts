import mongoose, { Schema, Document, Types } from 'mongoose';

export type CreditNoteStatus = 'issued' | 'applied' | 'voided';

export interface ICreditNote extends Document {
  creditNoteNumber: string;
  clinicId: Types.ObjectId;
  patientId: Types.ObjectId;
  invoiceId: Types.ObjectId;
  amount: string;
  /** Outstanding value that has not yet been applied to another invoice. */
  remainingAmount: string;
  /** Value applied to a target invoice (set when status becomes "applied"). */
  appliedAmount?: string;
  reason: string;
  status: CreditNoteStatus;
  appliedToInvoiceId?: Types.ObjectId;
  appliedAt?: Date;
  issuedBy: string;
  issuedAt: Date;
  voidedAt?: Date;
  voidedBy?: string;
}

const CreditNoteSchema = new Schema<ICreditNote>(
  {
    creditNoteNumber: { type: String, required: true, unique: true },
    clinicId: { type: Schema.Types.ObjectId, ref: 'Clinic', required: true, index: true },
    patientId: { type: Schema.Types.ObjectId, ref: 'Patient', required: true, index: true },
    invoiceId: { type: Schema.Types.ObjectId, ref: 'Invoice', required: true, index: true },
    amount: { type: String, required: true },
    remainingAmount: { type: String, required: true },
    appliedAmount: { type: String },
    reason: { type: String, required: true, trim: true, maxlength: 1000 },
    status: {
      type: String,
      enum: ['issued', 'applied', 'voided'],
      default: 'issued',
      index: true,
    },
    appliedToInvoiceId: { type: Schema.Types.ObjectId, ref: 'Invoice' },
    appliedAt: { type: Date },
    issuedBy: { type: String, required: true },
    issuedAt: { type: Date, default: Date.now },
    voidedAt: { type: Date },
    voidedBy: { type: String },
  },
  { timestamps: true, versionKey: false }
);

CreditNoteSchema.index({ clinicId: 1, createdAt: -1 });
CreditNoteSchema.index({ patientId: 1, createdAt: -1 });
CreditNoteSchema.index({ invoiceId: 1 });

export const CreditNoteModel = (mongoose.models.CreditNote ||
  mongoose.model<ICreditNote>(
    'CreditNote',
    CreditNoteSchema
  )) as import('mongoose').Model<ICreditNote>;
