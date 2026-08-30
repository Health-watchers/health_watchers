import { Schema, model, models } from 'mongoose';

/**
 * Drug catalog entry persisted from the bundled RxNorm-derived catalog
 * (Issue #1244). Enables DB-backed resolution and refresh of RxNorm data.
 */
export interface DrugRecord {
  rxCui: string;
  genericName: string;
  brandNames: string[];
  synonyms: string[];
  drugClass: string;
  source: 'rxnorm' | 'manual';
  active: boolean;
}

const drugSchema = new Schema<DrugRecord>(
  {
    rxCui: { type: String, required: true, unique: true, index: true },
    genericName: { type: String, required: true, unique: true, index: true },
    brandNames: { type: [String], default: [] },
    synonyms: { type: [String], default: [] },
    drugClass: { type: String, required: true, index: true },
    source: { type: String, enum: ['rxnorm', 'manual'], default: 'manual' },
    active: { type: Boolean, default: true, index: true },
  },
  { timestamps: true, versionKey: false, collection: 'interaction_drugs' }
);

drugSchema.index({ genericName: 'text', brandNames: 'text', synonyms: 'text' });

export const DrugModel = (models.Drug ||
  model<DrugRecord>('Drug', drugSchema)) as import('mongoose').Model<DrugRecord>;
