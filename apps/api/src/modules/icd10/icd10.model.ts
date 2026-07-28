import { Schema, model, models } from 'mongoose';

export interface IICD10Code {
  code: string;
  description: string;
  category: string;
  chapter: string;
  isValid: boolean;
}

const icd10Schema = new Schema<IICD10Code>(
  {
    code: { type: String, required: true, unique: true, uppercase: true, trim: true },
    description: { type: String, required: true },
    category: { type: String, default: '' },
    chapter: { type: String, default: '' },
    isValid: { type: Boolean, default: true },
  },
  { timestamps: false, versionKey: false }
);

// Compound text index for full-text search on description and code
icd10Schema.index({ description: 'text', code: 'text' }, { name: 'icd10_text_search', weights: { description: 10, code: 5 } });
// Prefix search on code
icd10Schema.index({ code: 1 });

export const ICD10Model = (models.ICD10Code ||
  model<IICD10Code>('ICD10Code', icd10Schema)) as import('mongoose').Model<IICD10Code>;
