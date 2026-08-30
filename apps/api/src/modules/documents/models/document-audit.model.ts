import { Schema, Types, model, models } from 'mongoose';

export type DocumentAuditAction =
  | 'upload'
  | 'new_version'
  | 'download'
  | 'preview'
  | 'view_metadata'
  | 'search_hit'
  | 'access_denied'
  | 'grant_created'
  | 'grant_revoked'
  | 'retention_assigned'
  | 'expired'
  | 'archived'
  | 'purged'
  | 'ocr_indexed';

/**
 * Immutable-by-convention audit trail for every document interaction (#1247).
 * Append-only; no update/delete paths are exposed.
 */
export interface DocumentAuditEntry {
  documentId: Types.ObjectId;
  clinicId: Types.ObjectId;
  actorId?: Types.ObjectId; // absent for system/sweep actions
  action: DocumentAuditAction;
  outcome: 'success' | 'denied' | 'error';
  ip?: string;
  userAgent?: string;
  metadata?: Record<string, unknown>;
}

const schema = new Schema<DocumentAuditEntry>(
  {
    documentId: {
      type: Schema.Types.ObjectId,
      ref: 'PatientDocument',
      required: true,
      index: true,
    },
    clinicId: { type: Schema.Types.ObjectId, ref: 'Clinic', required: true, index: true },
    actorId: { type: Schema.Types.ObjectId, ref: 'User' },
    action: { type: String, required: true },
    outcome: { type: String, enum: ['success', 'denied', 'error'], default: 'success' },
    ip: { type: String },
    userAgent: { type: String },
    metadata: { type: Schema.Types.Mixed },
  },
  { timestamps: { createdAt: true, updatedAt: false }, versionKey: false }
);

schema.index({ documentId: 1, createdAt: -1 });
schema.index({ clinicId: 1, action: 1, createdAt: -1 });

export const DocumentAuditModel = (models.DocumentAuditEntry ||
  model<DocumentAuditEntry>(
    'DocumentAuditEntry',
    schema
  )) as import('mongoose').Model<DocumentAuditEntry>;
