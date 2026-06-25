import { Schema, Types, model, models } from 'mongoose';

export interface IEncounterTemplate {
  clinicId: Types.ObjectId;
  /** null for global (system-wide) templates */
  isGlobal: boolean;
  name: string;
  description?: string;
  category: string;
  defaultChiefComplaint?: string;
  defaultVitalSigns?: Record<string, unknown>;
  suggestedDiagnoses?: { code: string; description: string }[];
  suggestedTests?: string[];
  notes?: string;
  isActive: boolean;
  createdBy: Types.ObjectId;
  usageCount: number;
  visibility?: 'private' | 'clinic' | 'public';
  publishedAt?: Date;
  publishedBy?: Types.ObjectId;
  importCount?: number;
  rating?: number;
  tags?: string[];
  isApproved?: boolean;
  approvedBy?: Types.ObjectId;
  /** Monotonically increasing version number within a lineage. Starts at 1. */
  version: number;
  /** Points to the template this was cloned/versioned from. Null for originals. */
  previousVersionId?: Types.ObjectId;
  /** True only for the most recent version in a lineage. */
  isLatest: boolean;
}

const encounterTemplateSchema = new Schema<IEncounterTemplate>(
  {
    clinicId: { type: Schema.Types.ObjectId, ref: 'Clinic', required: true, index: true },
    isGlobal: { type: Boolean, default: false, index: true },
    name: { type: String, required: true, trim: true },
    description: { type: String },
    category: { type: String, required: true, trim: true },
    defaultChiefComplaint: { type: String },
    defaultVitalSigns: { type: Schema.Types.Mixed },
    suggestedDiagnoses: [{ code: String, description: String, _id: false }],
    suggestedTests: [{ type: String }],
    notes: { type: String },
    isActive: { type: Boolean, default: true, index: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    usageCount: { type: Number, default: 0 },
    visibility: {
      type: String,
      enum: ['private', 'clinic', 'public'],
      default: 'private',
      index: true,
    },
    publishedAt: { type: Date },
    publishedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    importCount: { type: Number, default: 0 },
    rating: { type: Number, min: 0, max: 5, default: 0 },
    tags: { type: [String], default: [] },
    isApproved: { type: Boolean, default: false, index: true },
    approvedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    version: { type: Number, default: 1, min: 1 },
    previousVersionId: { type: Schema.Types.ObjectId, ref: 'EncounterTemplate', index: true },
    isLatest: { type: Boolean, default: true, index: true },
  },
  { timestamps: true, versionKey: false }
);

encounterTemplateSchema.index({ visibility: 1, isApproved: 1 });
encounterTemplateSchema.index({ tags: 1 });
encounterTemplateSchema.index({ rating: -1 });

export const EncounterTemplateModel =
  models.EncounterTemplate ||
  model<IEncounterTemplate>('EncounterTemplate', encounterTemplateSchema);
