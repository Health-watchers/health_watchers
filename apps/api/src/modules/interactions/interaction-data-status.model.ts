import { Schema, model, models } from 'mongoose';

/**
 * Tracks the freshness of the interaction database (Issue #1244). The
 * acceptance criterion "interaction data updated regularly" is enforced by
 * recording when the last CDC/FDA refresh happened and flagging staleness.
 */
export interface InteractionDataStatus {
  dataset: 'drug-catalog' | 'drug-drug' | 'drug-food';
  version: string;
  source: string;
  importedAt: Date;
  rowCount: number;
  checksum?: string;
}

const interactionDataStatusSchema = new Schema<InteractionDataStatus>(
  {
    dataset: {
      type: String,
      enum: ['drug-catalog', 'drug-drug', 'drug-food'],
      required: true,
      unique: true,
      index: true,
    },
    version: { type: String, required: true },
    source: { type: String, required: true },
    importedAt: { type: Date, required: true, default: () => new Date() },
    rowCount: { type: Number, default: 0 },
    checksum: { type: String, required: false },
  },
  { timestamps: true, versionKey: false, collection: 'interaction_data_status' }
);

export const InteractionDataStatusModel = (models.InteractionDataStatus ||
  model<InteractionDataStatus>(
    'InteractionDataStatus',
    interactionDataStatusSchema
  )) as import('mongoose').Model<InteractionDataStatus>;
