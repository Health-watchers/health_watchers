import { Schema, Types, model, models } from 'mongoose';

export type DocumentType = 'lab_result' | 'referral_letter' | 'consent_form' | 'medical_image' | 'other';

export interface PatientDocument {
  patientId:    Types.ObjectId;
  clinicId:     Types.ObjectId;
  uploadedBy:   Types.ObjectId;
  fileName:     string;
  mimeType:     string;
  sizeBytes:    number;
  storageKey:   string;   // S3 key or local relative path
  documentType: DocumentType;
}

const documentSchema = new Schema<PatientDocument>(
  {
    patientId:    { type: Schema.Types.ObjectId, ref: 'Patient',  required: true, index: true },
    clinicId:     { type: Schema.Types.ObjectId, ref: 'Clinic',   required: true, index: true },
    uploadedBy:   { type: Schema.Types.ObjectId, ref: 'User',     required: true },
    fileName:     { type: String, required: true },
    mimeType:     { type: String, required: true },
    sizeBytes:    { type: Number, required: true },
    storageKey:   { type: String, required: true },
    documentType: {
      type: String,
      enum: ['lab_result', 'referral_letter', 'consent_form', 'medical_image', 'other'],
      required: true,
    },
  },
  { timestamps: true, versionKey: false }
);

export const DocumentModel =
  models.PatientDocument || model<PatientDocument>('PatientDocument', documentSchema);
