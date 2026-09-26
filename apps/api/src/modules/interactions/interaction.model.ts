import { Schema, model, models } from 'mongoose';

/**
 * Stored drug–drug interaction rows (Issue #1244). The bundled baseline lives
 * in `interaction-data.ts`; `POST /interactions/refresh` merges updated
 * CDC/FDA exports into this collection, and checks run against the union.
 */
export interface InteractionRecord {
  drugA: string;
  drugB: string;
  severity: 'critical' | 'major' | 'moderate' | 'minor';
  mechanism: string;
  management: string;
  source: string;
  active: boolean;
}

const interactionSchema = new Schema<InteractionRecord>(
  {
    drugA: { type: String, required: true, index: true },
    drugB: { type: String, required: true, index: true },
    severity: {
      type: String,
      enum: ['critical', 'major', 'moderate', 'minor'],
      required: true,
      index: true,
    },
    mechanism: { type: String, required: true },
    management: { type: String, required: true },
    source: { type: String, required: true },
    active: { type: Boolean, default: true, index: true },
  },
  { timestamps: true, versionKey: false, collection: 'drug_interactions' }
);

// A given drug pair should only appear once (order-insensitive canonical key).
interactionSchema.index({ drugA: 1, drugB: 1 }, { unique: true });

export const InteractionModel = (models.Interaction ||
  model<InteractionRecord>(
    'Interaction',
    interactionSchema
  )) as import('mongoose').Model<InteractionRecord>;
