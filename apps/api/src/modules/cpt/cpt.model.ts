import { Schema, model, models } from 'mongoose';

export interface CPT {
  code: string;
  description: string;
  category: 'office-visit' | 'preventive-care' | 'procedure' | 'lab' | 'imaging' | 'other';
  defaultFee: string; // USD
}

const cptSchema = new Schema<CPT>(
  {
    code: { type: String, required: true, unique: true, index: true },
    description: { type: String, required: true },
    category: { 
      type: String, 
      enum: ['office-visit', 'preventive-care', 'procedure', 'lab', 'imaging', 'other'],
      required: true,
      index: true
    },
    defaultFee: { type: String, required: true },
  },
  { timestamps: true, versionKey: false }
);

cptSchema.index({ description: 'text', code: 'text' });

export const CPTModel = models.CPT || model<CPT>('CPT', cptSchema);
