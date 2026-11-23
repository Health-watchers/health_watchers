import mongoose, { Schema, Document } from 'mongoose';
import { baseSchema } from '@api/shared';

export interface BAA extends Document {
  clinicId: mongoose.Types.ObjectId;
  businessAssociate: string; // e.g., "Google Gemini", "Stellar", "MongoDB Atlas"
  status: 'signed' | 'pending' | 'expired';
  signedDate?: Date;
  expiryDate?: Date;
  documentUrl?: string;
  documentStorageKey?: string;
  documentFileName?: string;
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
    documentStorageKey: String,
    documentFileName: String,
    notes: String,
  },
  { timestamps: true }
);

baaSchema.add(baseSchema);

export const BAAModel = mongoose.model<BAA>('BAA', baaSchema);
