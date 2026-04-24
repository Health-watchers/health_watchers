import { Schema, Types, model, models } from 'mongoose';

export type ConsentType = 'treatment' | 'data_sharing' | 'ai_analysis' | 'research' | 'marketing';
export type ConsentStatus = 'granted' | 'withdrawn' | 'pending';

export interface IConsent {
  patientId: Types.ObjectId;
  clinicId: Types.ObjectId;
  type: ConsentType;
  status: ConsentStatus;
  grantedAt?: Date;
  withdrawnAt?: Date;
  expiresAt?: Date;
  version: string;
  ipAddress?: string;
  grantedBy?: Types.ObjectId; // userId who recorded the consent
}

const consentSchema = new Schema<IConsent>(
  {
    patientId: { type: Schema.Types.ObjectId, ref: 'Patient', required: true, index: true },
    clinicId: { type: Schema.Types.ObjectId, ref: 'Clinic', required: true, index: true },
    type: {
      type: String,
      enum: ['treatment', 'data_sharing', 'ai_analysis', 'research', 'marketing'],
      required: true,
    },
    status: { type: String, enum: ['granted', 'withdrawn', 'pending'], required: true, default: 'pending' },
    grantedAt: { type: Date },
    withdrawnAt: { type: Date },
    expiresAt: { type: Date },
    version: { type: String, required: true, default: '1.0' },
    ipAddress: { type: String },
    grantedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true, versionKey: false }
);

consentSchema.index({ patientId: 1, clinicId: 1, type: 1 }, { unique: true });

export const ConsentModel = models.Consent || model<IConsent>('Consent', consentSchema);

// Current consent form versions
export const CONSENT_TEMPLATES: Record<ConsentType, { version: string; title: string; text: string }> = {
  treatment: {
    version: '1.0',
    title: 'Consent for Treatment',
    text: 'I consent to receive medical treatment and care from this clinic.',
  },
  data_sharing: {
    version: '1.0',
    title: 'Consent for Data Sharing',
    text: 'I consent to the sharing of my health information with authorized parties for care coordination.',
  },
  ai_analysis: {
    version: '1.0',
    title: 'Consent for AI Analysis',
    text: 'I consent to the use of AI tools to analyze my health records to assist in my care.',
  },
  research: {
    version: '1.0',
    title: 'Consent for Research',
    text: 'I consent to the use of my de-identified health data for medical research purposes.',
  },
  marketing: {
    version: '1.0',
    title: 'Consent for Marketing Communications',
    text: 'I consent to receive health tips and promotional communications from this clinic.',
  },
};
