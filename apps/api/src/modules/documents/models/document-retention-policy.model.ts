import { Schema, Types, model, models } from 'mongoose';
import type { DocumentType } from './document.model';

export type RetentionAction = 'expire' | 'archive' | 'purge';

export interface DocumentRetentionPolicy {
  clinicId: Types.ObjectId;
  name: string;
  description?: string;
  /** Applies to these document types; empty = all types. */
  documentTypes: DocumentType[];
  /** Days after upload before the retention window ends. */
  retentionDays: number;
  /** What to do when the window ends. */
  action: RetentionAction;
  /** Grace period (days) after expiry before a `purge` policy deletes bytes. */
  purgeAfterDays: number;
  /** Legal hold — when true the sweep never acts on matching documents. */
  legalHold: boolean;
  isActive: boolean;
  createdBy: Types.ObjectId;
}

const schema = new Schema<DocumentRetentionPolicy>(
  {
    clinicId: { type: Schema.Types.ObjectId, ref: 'Clinic', required: true },
    name: { type: String, required: true, trim: true },
    description: { type: String },
    documentTypes: {
      type: [String],
      enum: ['lab_result', 'referral_letter', 'consent_form', 'medical_image', 'other'],
      default: [],
    },
    retentionDays: { type: Number, required: true, min: 1 },
    action: { type: String, enum: ['expire', 'archive', 'purge'], default: 'expire' },
    purgeAfterDays: { type: Number, default: 30, min: 0 },
    legalHold: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true, versionKey: false }
);

schema.index({ clinicId: 1, name: 1 }, { unique: true });
schema.index({ clinicId: 1, isActive: 1 });

export const DocumentRetentionPolicyModel = (models.DocumentRetentionPolicy ||
  model<DocumentRetentionPolicy>(
    'DocumentRetentionPolicy',
    schema
  )) as import('mongoose').Model<DocumentRetentionPolicy>;
