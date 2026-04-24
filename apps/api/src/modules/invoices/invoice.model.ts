import mongoose, { Schema, Document, Types } from 'mongoose';

export interface ILineItem {
  description: string;
  quantity: number;
  unitPrice: string;
  total: string;
}

export interface IInvoice extends Document {
  invoiceNumber: string;
  clinicId: Types.ObjectId;
  patientId: Types.ObjectId;
  encounterId?: Types.ObjectId;
  lineItems: ILineItem[];
  subtotal: string;
  total: string;
  currency: 'XLM' | 'USDC';
  status: 'draft' | 'sent' | 'paid' | 'cancelled';
  dueDate: Date;
  stellarMemo: string;
  stellarDestination: string;
  paymentIntentId?: string;
  paidAt?: Date;
  paidTxHash?: string;
}

const LineItemSchema = new Schema<ILineItem>(
  {
    description: { type: String, required: true },
    quantity:    { type: Number, required: true, min: 1 },
    unitPrice:   { type: String, required: true },
    total:       { type: String, required: true },
  },
  { _id: false },
);

const InvoiceSchema = new Schema<IInvoice>(
  {
    invoiceNumber:       { type: String, required: true, unique: true },
    clinicId:            { type: Schema.Types.ObjectId, ref: 'Clinic', required: true },
    patientId:           { type: Schema.Types.ObjectId, ref: 'Patient', required: true },
    encounterId:         { type: Schema.Types.ObjectId, ref: 'Encounter' },
    lineItems:           { type: [LineItemSchema], required: true },
    subtotal:            { type: String, required: true },
    total:               { type: String, required: true },
    currency:            { type: String, enum: ['XLM', 'USDC'], default: 'XLM' },
    status:              { type: String, enum: ['draft', 'sent', 'paid', 'cancelled'], default: 'draft' },
    dueDate:             { type: Date, required: true },
    stellarMemo:         { type: String, required: true },
    stellarDestination:  { type: String, required: true },
    paymentIntentId:     { type: String },
    paidAt:              { type: Date },
    paidTxHash:          { type: String },
  },
  { timestamps: true, versionKey: false },
);

InvoiceSchema.index({ clinicId: 1, createdAt: -1 });
InvoiceSchema.index({ patientId: 1, createdAt: -1 });
InvoiceSchema.index({ status: 1 });

export const InvoiceModel =
  mongoose.models.Invoice || mongoose.model<IInvoice>('Invoice', InvoiceSchema);
