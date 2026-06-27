import { Schema, Types, model, models } from 'mongoose';

export interface MergeLog {
  primaryId: Types.ObjectId;
  duplicateId: Types.ObjectId;
  clinicId: Types.ObjectId;
  mergedBy: Types.ObjectId;
  mergedAt: Date;
  primarySnapshot: Record<string, unknown>;   // full doc before merge
  duplicateSnapshot: Record<string, unknown>; // full doc before merge
  undoneBy?: Types.ObjectId;
  undoneAt?: Date;
}

const mergeLogSchema = new Schema<MergeLog>(
  {
    primaryId:         { type: Schema.Types.ObjectId, required: true, ref: 'Patient', index: true },
    duplicateId:       { type: Schema.Types.ObjectId, required: true, ref: 'Patient', index: true },
    clinicId:          { type: Schema.Types.ObjectId, required: true, ref: 'Clinic',  index: true },
    mergedBy:          { type: Schema.Types.ObjectId, required: true, ref: 'User' },
    mergedAt:          { type: Date, required: true, default: () => new Date() },
    primarySnapshot:   { type: Schema.Types.Mixed, required: true },
    duplicateSnapshot: { type: Schema.Types.Mixed, required: true },
    undoneBy:          { type: Schema.Types.ObjectId, ref: 'User' },
    undoneAt:          { type: Date },
  },
  { timestamps: false, versionKey: false }
);

export const MergeLogModel = models.MergeLog || model<MergeLog>('MergeLog', mergeLogSchema);
