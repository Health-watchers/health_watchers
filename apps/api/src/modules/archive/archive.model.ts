import { Schema, model, models } from 'mongoose';

export interface ArchivedRecord {
  originalCollectionName: string;
  originalDocumentId: Schema.Types.ObjectId;
  archiveReason: 'age' | 'retention_policy' | 'manual' | 'compliance';
  archivedData: Record<string, any>;
  archivedAt: Date;
  archivedBy?: Schema.Types.ObjectId;
  expiryDate?: Date;
  restoreMetadata?: {
    restoreableUntil: Date;
    restoredAt?: Date;
    restoredBy?: Schema.Types.ObjectId;
  };
  clinicId: Schema.Types.ObjectId;
  createdAt?: Date;
  updatedAt?: Date;
}

const archivedRecordSchema = new Schema<ArchivedRecord>(
  {
    originalCollectionName: { type: String, required: true, index: true },
    originalDocumentId: { type: Schema.Types.ObjectId, required: true, index: true },
    archiveReason: {
      type: String,
      enum: ['age', 'retention_policy', 'manual', 'compliance'],
      required: true,
      index: true,
    },
    archivedData: { type: Schema.Types.Mixed, required: true },
    archivedAt: { type: Date, default: Date.now, index: true },
    archivedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    expiryDate: { type: Date, index: true },
    restoreMetadata: {
      type: new Schema(
        {
          restoreableUntil: { type: Date, required: true },
          restoredAt: { type: Date },
          restoredBy: { type: Schema.Types.ObjectId, ref: 'User' },
        },
        { _id: false }
      ),
    },
    clinicId: { type: Schema.Types.ObjectId, ref: 'Clinic', required: true, index: true },
  },
  { timestamps: true, versionKey: false }
);

// Compound indexes for archival queries
archivedRecordSchema.index({ clinicId: 1, originalCollectionName: 1, archivedAt: -1 });
archivedRecordSchema.index({ clinicId: 1, expiryDate: 1 });
archivedRecordSchema.index({ originalDocumentId: 1, originalCollectionName: 1 });

export const ArchiveModel = (models.Archive ||
  model<ArchivedRecord>('Archive', archivedRecordSchema)) as import('mongoose').Model<ArchivedRecord>;
