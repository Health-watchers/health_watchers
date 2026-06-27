import { Schema, Types, model, models } from 'mongoose';

export type AuditAction =
  | 'LOGIN_SUCCESS'
  | 'LOGIN_FAILURE'
  | 'PATIENT_VIEW'
  | 'PATIENT_CREATE'
  | 'PATIENT_UPDATE'
  | 'PATIENT_DELETE'
  | 'ENCOUNTER_VIEW'
  | 'ENCOUNTER_CREATE'
  | 'ENCOUNTER_UPDATE'
  | 'PAYMENT_CREATE'
  | 'EXPORT_PATIENT_DATA'
  | 'ALLERGY_CREATE'
  | 'ALLERGY_UPDATE'
  | 'ALLERGY_DELETE'
  | 'ALLERGY_OVERRIDE'
  | 'KEYPAIR_CREATE'
  | 'KEYPAIR_ROTATE'
  | 'DISPUTE_OPENED'
  | 'DISPUTE_RESOLVED'
  | 'REFUND_ISSUED'
  | 'IMMUNIZATION_CREATE'
  | 'IMMUNIZATION_UPDATE'
  | 'IMMUNIZATION_DELETE'
  | 'IMMUNIZATION_CERTIFICATE'
  | 'PATIENT_PHOTO_UPLOAD'
  | 'PATIENT_PHOTO_ACCESS'
  | 'PATIENT_PHOTO_DELETE'
  | 'PAYMENT_EXPORT'
  | 'DOSAGE_CALCULATION'
  | 'CRITICAL_LAB_RESULT'
  | 'CRITICAL_LAB_ACKNOWLEDGED'
  | 'CLINIC_SWITCH'
  | 'DATA_EXPORT_REQUEST'
  | 'DATA_EXPORT_FULFILLED'
  | 'CONSENT_VERSION_ACCEPTED';

export interface AuditLog {
  userId?: Types.ObjectId;
  clinicId?: Types.ObjectId;
  action: AuditAction;
  resourceType?: string;
  resourceId?: string;
  ipAddress?: string;
  userAgent?: string;
  requestId?: string;
  outcome: 'SUCCESS' | 'FAILURE';
  metadata?: Record<string, unknown>;
  timestamp: Date;
}

const auditLogSchema = new Schema<AuditLog>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: false },
    clinicId: { type: Schema.Types.ObjectId, ref: 'Clinic', required: false },
    action: {
      type: String,
      required: true,
      enum: [
        'LOGIN_SUCCESS',
        'LOGIN_FAILURE',
        'PATIENT_VIEW',
        'PATIENT_CREATE',
        'PATIENT_UPDATE',
        'PATIENT_DELETE',
        'ENCOUNTER_VIEW',
        'ENCOUNTER_CREATE',
        'ENCOUNTER_UPDATE',
        'PAYMENT_CREATE',
        'EXPORT_PATIENT_DATA',
        'ALLERGY_CREATE',
        'ALLERGY_UPDATE',
        'ALLERGY_DELETE',
        'ALLERGY_OVERRIDE',
        'KEYPAIR_CREATE',
        'KEYPAIR_ROTATE',
        'DISPUTE_OPENED',
        'DISPUTE_RESOLVED',
        'REFUND_ISSUED',
        'IMMUNIZATION_CREATE',
        'IMMUNIZATION_UPDATE',
        'IMMUNIZATION_DELETE',
        'IMMUNIZATION_CERTIFICATE',
        'PATIENT_PHOTO_UPLOAD',
        'PATIENT_PHOTO_ACCESS',
        'PATIENT_PHOTO_DELETE',
        'PAYMENT_EXPORT',
        'DOSAGE_CALCULATION',
        'CRITICAL_LAB_RESULT',
        'CRITICAL_LAB_ACKNOWLEDGED',
        'CLINIC_SWITCH',
        'DATA_EXPORT_REQUEST',
        'DATA_EXPORT_FULFILLED',
        'CONSENT_VERSION_ACCEPTED',
      ],
      index: true,
    },
    resourceType: { type: String, required: false },
    resourceId: { type: String, required: false, index: true },
    ipAddress: { type: String, required: false },
    userAgent: { type: String, required: false },
    requestId: { type: String, required: false, index: true },
    outcome: { type: String, enum: ['SUCCESS', 'FAILURE'], required: true, default: 'SUCCESS' },
    metadata: { type: Schema.Types.Mixed, required: false },
    timestamp: { type: Date, required: true, default: () => new Date(), index: true },
  },
  {
    timestamps: false,
    versionKey: false,
    collection: 'audit_logs',
  },
);

// Prevent updates and deletes - immutable logs
auditLogSchema.pre('updateOne', function () {
  throw new Error('Audit logs are immutable and cannot be updated');
});

auditLogSchema.pre('findOneAndUpdate', function () {
  throw new Error('Audit logs are immutable and cannot be updated');
});

auditLogSchema.pre('deleteOne', function () {
  throw new Error('Audit logs are immutable and cannot be deleted');
});

auditLogSchema.pre('findOneAndDelete', function () {
  throw new Error('Audit logs are immutable and cannot be deleted');
});

// Indexes for efficient querying
auditLogSchema.index({ timestamp: -1 });
auditLogSchema.index({ userId: 1, timestamp: -1 });
auditLogSchema.index({ clinicId: 1, timestamp: -1 });
auditLogSchema.index({ action: 1, timestamp: -1 });
auditLogSchema.index({ outcome: 1, timestamp: -1 });
auditLogSchema.index({ resourceType: 1, timestamp: -1 });
auditLogSchema.index({ ipAddress: 1, timestamp: -1 });
// Full-text search across action field (metadata is Mixed so not indexable as text)
auditLogSchema.index({ action: 'text' }, { name: 'audit_text_search' });

export const AuditLogModel = models.AuditLog || model<AuditLog>('AuditLog', auditLogSchema);
