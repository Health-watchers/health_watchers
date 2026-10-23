import { Schema, Types, model, models } from 'mongoose';

/**
 * Break-the-glass emergency access grant (#1493).
 *
 * Grants are never deleted: once `expiresAt` passes (or the clinician ends access
 * early via `endedAt`) the grant simply stops authorising access, while the record
 * stays in the compliance review queue.
 */
export const EMERGENCY_ACCESS_REASONS = [
  'LIFE_THREATENING_EMERGENCY',
  'PATIENT_UNABLE_TO_CONSENT',
  'URGENT_CONTINUITY_OF_CARE',
  'COVERING_FOR_TREATING_CLINICIAN',
  'OTHER',
] as const;
export type EmergencyAccessReason = (typeof EMERGENCY_ACCESS_REASONS)[number];

export const EMERGENCY_ACCESS_REVIEW_STATUSES = ['PENDING', 'APPROVED', 'FLAGGED'] as const;
export type EmergencyAccessReviewStatus = (typeof EMERGENCY_ACCESS_REVIEW_STATUSES)[number];

export interface EmergencyAccessGrant {
  userId: Types.ObjectId;
  /** Requesting clinician's clinic */
  clinicId: Types.ObjectId;
  patientId: Types.ObjectId;
  /** Clinic that owns the patient record */
  patientClinicId: Types.ObjectId;
  reason: EmergencyAccessReason;
  justification: string;
  grantedAt: Date;
  expiresAt: Date;
  endedAt?: Date;
  reviewStatus: EmergencyAccessReviewStatus;
  reviewedBy?: Types.ObjectId;
  reviewedAt?: Date;
  reviewNotes?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

const emergencyAccessGrantSchema = new Schema<EmergencyAccessGrant>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    clinicId: { type: Schema.Types.ObjectId, ref: 'Clinic', required: true },
    patientId: { type: Schema.Types.ObjectId, ref: 'Patient', required: true },
    patientClinicId: { type: Schema.Types.ObjectId, ref: 'Clinic', required: true },
    reason: { type: String, enum: EMERGENCY_ACCESS_REASONS, required: true },
    justification: { type: String, required: true, trim: true, maxlength: 1000 },
    grantedAt: { type: Date, required: true, default: () => new Date() },
    expiresAt: { type: Date, required: true },
    endedAt: { type: Date },
    reviewStatus: {
      type: String,
      enum: EMERGENCY_ACCESS_REVIEW_STATUSES,
      required: true,
      default: 'PENDING',
    },
    reviewedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    reviewedAt: { type: Date },
    reviewNotes: { type: String, trim: true, maxlength: 2000 },
  },
  { timestamps: true, versionKey: false, collection: 'emergency_access_grants' }
);

// Active-grant lookup on every cross-clinic patient read
emergencyAccessGrantSchema.index({ userId: 1, patientId: 1, expiresAt: -1 });
// Compliance review queue, scoped to either clinic involved
emergencyAccessGrantSchema.index({ patientClinicId: 1, reviewStatus: 1, grantedAt: -1 });
emergencyAccessGrantSchema.index({ clinicId: 1, reviewStatus: 1, grantedAt: -1 });

export const EmergencyAccessGrantModel = (models.EmergencyAccessGrant ||
  model<EmergencyAccessGrant>(
    'EmergencyAccessGrant',
    emergencyAccessGrantSchema
  )) as import('mongoose').Model<EmergencyAccessGrant>;
