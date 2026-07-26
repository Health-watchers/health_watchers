import { Schema, Types, model, models } from 'mongoose';

export type DocumentType =
  | 'lab_result'
  | 'referral_letter'
  | 'consent_form'
  | 'medical_image'
  | 'other';

export interface DocumentVersion {
  documentId: Types.ObjectId;
  patientId: Types.ObjectId;
  clinicId: Types.ObjectId;
  uploadedBy: Types.ObjectId;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  storageKey: string;
  documentType: DocumentType;
  version: number;
  isCurrentVersion: boolean;
  replacedAt?: Date;
  replacedBy?: Types.ObjectId;
}

const documentVersionSchema = new Schema<DocumentVersion>(
  {
    documentId: {
      type: Schema.Types.ObjectId,
      ref: 'PatientDocument',
      required: true,
      index: true,
    },
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
    version: { type: Number, required: true, default: 1 },
    isCurrentVersion: { type: Boolean, required: true, default: true },
    replacedAt: { type: Date },
    replacedBy: { type: Schema.Types.ObjectId, ref: 'DocumentVersion' },
  },
  { timestamps: true, versionKey: false }
);

documentVersionSchema.index({ documentId: 1, version: -1 });
documentVersionSchema.index({ patientId: 1, clinicId: 1, isCurrentVersion: 1 });

export const DocumentVersionModel = (models.DocumentVersion ||
  model<DocumentVersion>(
    'DocumentVersion',
    documentVersionSchema
  )) as import('mongoose').Model<DocumentVersion>;
