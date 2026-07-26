import mongoose, { Schema, Document } from 'mongoose';

export interface BAA extends Document {
  clinicId: mongoose.Types.ObjectId;
  businessAssociate: string; // e.g., "Google Gemini", "Stellar", "MongoDB Atlas"
  status: 'signed' | 'pending' | 'expired';
  signedDate?: Date;
  expiryDate?: Date;
  documentUrl?: string;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

const baaSchema = new Schema<BAA>(
  {
    clinicId: { type: Schema.Types.ObjectId, required: true, index: true },
    businessAssociate: { type: String, required: true },
    status: { type: String, enum: ['signed', 'pending', 'expired'], default: 'pending' },
    signedDate: Date,
    expiryDate: Date,
    documentUrl: String,
    notes: String,
  },
  { timestamps: true }
);

export const BAAModel = mongoose.model<BAA>('BAA', baaSchema);
