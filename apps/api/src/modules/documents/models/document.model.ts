import { Schema, Types, model, models } from 'mongoose';

export type DocumentType =
  | 'lab_result'
  | 'referral_letter'
  | 'consent_form'
  | 'medical_image'
  | 'other';

/** Coarse visibility class; fine-grained grants live in DocumentAccessGrant. */
export type DocumentAccessLevel = 'clinic' | 'restricted' | 'private';

export type DocumentLifecycleStatus = 'active' | 'archived' | 'expired' | 'deleted';

export type OcrStatus = 'pending' | 'processing' | 'done' | 'skipped' | 'failed';
export type PreviewStatus = 'pending' | 'processing' | 'done' | 'unsupported' | 'failed';

/** At-rest envelope-encryption metadata (local storage driver). */
export interface DocumentEncryption {
  algorithm: 'aes-256-gcm';
  iv: string; // base64
  authTag: string; // base64
  wrappedKey: string; // base64 — data key sealed with the master key
}

export interface PatientDocument {
  patientId: Types.ObjectId;
  clinicId: Types.ObjectId;
  uploadedBy: Types.ObjectId;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  storageKey: string; // S3 key or local relative path
  documentType: DocumentType;
  currentVersion: number;
  versionCount: number;

  // ── #1247 additions (all optional so existing docs keep working) ──────────
  tags?: string[];
  description?: string;
  contentSha256?: string;

  accessLevel?: DocumentAccessLevel;
  allowedRoles?: string[];
  allowedUserIds?: Types.ObjectId[];

  retentionPolicyId?: Types.ObjectId;
  retainUntil?: Date; // earliest date the document may be purged
  expiresAt?: Date; // date the document becomes inaccessible / eligible for purge
  status?: DocumentLifecycleStatus;
  deletedAt?: Date;

  ocrText?: string;
  ocrStatus?: OcrStatus;
  ocrProcessedAt?: Date;

  previewStorageKey?: string;
  previewStatus?: PreviewStatus;

  encryption?: DocumentEncryption;
}

const encryptionSchema = new Schema<DocumentEncryption>(
  {
    algorithm: { type: String, enum: ['aes-256-gcm'], required: true },
    iv: { type: String, required: true },
    authTag: { type: String, required: true },
    wrappedKey: { type: String, required: true },
  },
  { _id: false }
);

const documentSchema = new Schema<PatientDocument>(
  {
    patientId: { type: Schema.Types.ObjectId, ref: 'Patient', required: true, index: true },
    clinicId: { type: Schema.Types.ObjectId, ref: 'Clinic', required: true, index: true },
    uploadedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    fileName: { type: String, required: true },
    mimeType: { type: String, required: true },
    sizeBytes: { type: Number, required: true },
    storageKey: { type: String, required: true },
    documentType: {
      type: String,
      enum: ['lab_result', 'referral_letter', 'consent_form', 'medical_image', 'other'],
      required: true,
    },
    currentVersion: { type: Number, default: 1 },
    versionCount: { type: Number, default: 1 },

    tags: { type: [String], default: undefined },
    description: { type: String },
    contentSha256: { type: String },

    accessLevel: {
      type: String,
      enum: ['clinic', 'restricted', 'private'],
      default: 'clinic',
    },
    allowedRoles: { type: [String], default: undefined },
    allowedUserIds: { type: [Schema.Types.ObjectId], ref: 'User', default: undefined },

    retentionPolicyId: { type: Schema.Types.ObjectId, ref: 'DocumentRetentionPolicy' },
    retainUntil: { type: Date },
    expiresAt: { type: Date },
    status: {
      type: String,
      enum: ['active', 'archived', 'expired', 'deleted'],
      default: 'active',
    },
    deletedAt: { type: Date },

    ocrText: { type: String },
    ocrStatus: {
      type: String,
      enum: ['pending', 'processing', 'done', 'skipped', 'failed'],
    },
    ocrProcessedAt: { type: Date },

    previewStorageKey: { type: String },
    previewStatus: {
      type: String,
      enum: ['pending', 'processing', 'done', 'unsupported', 'failed'],
    },

    encryption: { type: encryptionSchema, default: undefined },
  },
  { timestamps: true, versionKey: false }
);

// Full-text search over extracted content + metadata (#1247).
documentSchema.index(
  { ocrText: 'text', fileName: 'text', description: 'text', tags: 'text' },
  { weights: { fileName: 10, tags: 6, description: 4, ocrText: 1 }, name: 'document_content_text' }
);
documentSchema.index({ clinicId: 1, status: 1, expiresAt: 1 });
documentSchema.index({ patientId: 1, clinicId: 1, status: 1, createdAt: -1 });

export const DocumentModel = (models.PatientDocument ||
  model<PatientDocument>(
    'PatientDocument',
    documentSchema
  )) as import('mongoose').Model<PatientDocument>;
