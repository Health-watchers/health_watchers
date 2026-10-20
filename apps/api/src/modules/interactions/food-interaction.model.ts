import { Schema, model, models } from 'mongoose';

/**
 * Drug–food interaction rows (Issue #1244). Baseline data lives in
 * `food-interaction-data.ts`; refresh merges updated FDA/CDC guidance.
 */
export interface FoodInteractionRecord {
  drug: string;
  food: string;
  severity: 'critical' | 'major' | 'moderate' | 'minor';
  effect: string;
  management: string;
  source: string;
  active: boolean;
}

const foodInteractionSchema = new Schema<FoodInteractionRecord>(
  {
    drug: { type: String, required: true, index: true },
    food: { type: String, required: true },
    severity: { type: String, enum: ['critical', 'major', 'moderate', 'minor'], required: true },
    effect: { type: String, required: true },
    management: { type: String, required: true },
    source: { type: String, required: true },
    active: { type: Boolean, default: true, index: true },
  },
  { timestamps: true, versionKey: false, collection: 'drug_food_interactions' }
);

foodInteractionSchema.index({ drug: 1, food: 1 }, { unique: true });

export const FoodInteractionModel = (models.FoodInteraction ||
  model<FoodInteractionRecord>(
    'FoodInteraction',
    foodInteractionSchema
  )) as import('mongoose').Model<FoodInteractionRecord>;
