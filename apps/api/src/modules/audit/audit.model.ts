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
  | 'REFERRAL_CREATE'
  | 'REFERRAL_ACCEPT'
  | 'REFERRAL_DATA_ACCESS';

export interface AuditLog {
  userId?: Types.ObjectId;
  clinicId?: Types.ObjectId;
  action: AuditAction;
  resourceType?: string;
  resourceId?: string;
  ipAddress?: string;
  userAgent?: string;
  outcome: 'SUCCESS' | 'FAILURE';
  metadata?: Record<string, any>;
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
        'REFERRAL_CREATE',
        'REFERRAL_ACCEPT',
        'REFERRAL_DATA_ACCESS',
      ],
      index: true,
    },
    resourceType: { type: String, required: false },
    resourceId: { type: String, required: false, index: true },
    ipAddress: { type: String, required: false },
    userAgent: { type: String, required: false },
    outcome: { type: String, enum: ['SUCCESS', 'FAILURE'], required: true, default: 'SUCCESS' },
    metadata: { type: Schema.Types.Mixed, required: false },
    timestamp: { type: Date, required: true, default: () => new Date(), index: true },
  },
  {
    timestamps: false,
    versionKey: false,
    collection: 'audit_logs',
  }
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

export const AuditLogModel = models.AuditLog || model<AuditLog>('AuditLog', auditLogSchema);
