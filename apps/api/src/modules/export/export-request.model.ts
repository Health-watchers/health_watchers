import { Schema, model, models } from 'mongoose';

/**
 * Tracks a patient's HIPAA Right of Access data-export request (45 CFR §164.524).
 * HIPAA requires fulfilment within 30 days, so each request carries an SLA
 * deadline and exposes a hashed, time-limited secure download token.
 */
export type ExportFormat = 'json' | 'pdf' | 'csv' | 'fhir';
export type ExportRequestStatus = 'pending' | 'processing' | 'ready' | 'failed' | 'expired';

export interface ExportRequest {
  patientId: Schema.Types.ObjectId | string;
  clinicId: Schema.Types.ObjectId | string;
  requestedBy: Schema.Types.ObjectId | string;
  formats: ExportFormat[];
  status: ExportRequestStatus;
  requestedAt: Date;
  fulfilledAt?: Date;
  /** HIPAA 30-day fulfilment deadline (requestedAt + 30 days). */
  slaDeadline: Date;
  /** SHA-256 hash of the secure download token (raw token only sent via email link). */
  downloadTokenHash?: string;
  downloadExpiresAt?: Date;
  downloadCount: number;
  failureReason?: string;
}

const exportRequestSchema = new Schema<ExportRequest>(
  {
    patientId: { type: Schema.Types.ObjectId, ref: 'Patient', required: true, index: true },
    clinicId: { type: Schema.Types.ObjectId, ref: 'Clinic', required: true, index: true },
    requestedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    formats: {
      type: [String],
      enum: ['json', 'pdf', 'csv', 'fhir'],
      default: ['json', 'pdf', 'csv', 'fhir'],
    },
    status: {
      type: String,
      enum: ['pending', 'processing', 'ready', 'failed', 'expired'],
      default: 'pending',
      index: true,
    },
    requestedAt: { type: Date, default: () => new Date(), index: true },
    fulfilledAt: { type: Date },
    slaDeadline: { type: Date, required: true, index: true },
    downloadTokenHash: { type: String, select: false, index: true },
    downloadExpiresAt: { type: Date },
    downloadCount: { type: Number, default: 0 },
    failureReason: { type: String },
  },
  { timestamps: true, versionKey: false },
);

export const ExportRequestModel =
  models.ExportRequest || model<ExportRequest>('ExportRequest', exportRequestSchema);
