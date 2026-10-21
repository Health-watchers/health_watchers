import { Schema, Types, model, models } from 'mongoose';

export type DocumentPermission = 'read' | 'write';

/** An explicit grant of access to one document for one user. */
export interface DocumentAccessGrant {
  documentId: Types.ObjectId;
  clinicId: Types.ObjectId;
  userId: Types.ObjectId;
  permission: DocumentPermission;
  grantedBy: Types.ObjectId;
  expiresAt?: Date;
  reason?: string;
  revokedAt?: Date;
  revokedBy?: Types.ObjectId;
}

const schema = new Schema<DocumentAccessGrant>(
  {
    documentId: { type: Schema.Types.ObjectId, ref: 'PatientDocument', required: true },
    clinicId: { type: Schema.Types.ObjectId, ref: 'Clinic', required: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    permission: { type: String, enum: ['read', 'write'], default: 'read' },
    grantedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    expiresAt: { type: Date },
    reason: { type: String },
    revokedAt: { type: Date },
    revokedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true, versionKey: false }
);

schema.index({ documentId: 1, userId: 1, revokedAt: 1 });
schema.index({ userId: 1, clinicId: 1 });

export const DocumentAccessGrantModel = (models.DocumentAccessGrant ||
  model<DocumentAccessGrant>(
    'DocumentAccessGrant',
    schema
  )) as import('mongoose').Model<DocumentAccessGrant>;
