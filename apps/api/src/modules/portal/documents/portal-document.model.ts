import mongoose, { Document, Schema } from 'mongoose';

export type DocumentCategory = 'insurance_card' | 'referral_letter' | 'lab_result' | 'imaging' | 'id_document' | 'other';
export type DocumentVisibility = 'care_team' | 'treating_doctor_only' | 'private';

export interface IPortalDocument extends Document {
  patientId:  mongoose.Types.ObjectId;
  clinicId:   mongoose.Types.ObjectId;
  fileName:   string;
  mimeType:   string;
  sizeBytes:  number;
  category:   DocumentCategory;
  visibility: DocumentVisibility;
  storageKey: string;
  uploadedAt: Date;
  notifiedAt?: Date;
  deletedAt?:  Date;
}

const PortalDocumentSchema = new Schema<IPortalDocument>(
  {
    patientId:  { type: Schema.Types.ObjectId, ref: 'Patient', required: true, index: true },
    clinicId:   { type: Schema.Types.ObjectId, ref: 'Clinic',  required: true, index: true },
    fileName:   { type: String, required: true, maxlength: 255 },
    mimeType:   { type: String, required: true },
    sizeBytes:  { type: Number, required: true, min: 1 },
    category:   { type: String, enum: ['insurance_card','referral_letter','lab_result','imaging','id_document','other'], required: true },
    visibility: { type: String, enum: ['care_team','treating_doctor_only','private'], default: 'care_team' },
    storageKey: { type: String, required: true },
    uploadedAt: { type: Date, default: Date.now },
    notifiedAt: { type: Date },
    deletedAt:  { type: Date },
  },
  { timestamps: true },
);

PortalDocumentSchema.index({ patientId: 1, uploadedAt: -1 });

export const PortalDocumentModel = mongoose.model<IPortalDocument>('PortalDocument', PortalDocumentSchema);
