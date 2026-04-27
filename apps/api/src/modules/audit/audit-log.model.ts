import { Schema, model, models } from 'mongoose';

export type AuditAction = 'READ' | 'CREATE' | 'UPDATE' | 'DELETE';
export type AuditResourceType = 'Patient' | 'Encounter' | 'Payment';

export interface AuditLog {
  userId: string;
  clinicId: string;
  action: AuditAction;
  resourceType: AuditResourceType;
  resourceId: string;
  ipAddress: string;
  userAgent: string;
  timestamp: Date;
}

const auditLogSchema = new Schema<AuditLog>(
  {
    userId: { type: String, required: true, index: true },
    clinicId: { type: String, required: true, index: true },
    action: { type: String, enum: ['READ', 'CREATE', 'UPDATE', 'DELETE'], required: true },
    resourceType: { type: String, enum: ['Patient', 'Encounter', 'Payment'], required: true },
    resourceId: { type: String, required: true },
    ipAddress: { type: String, required: true },
    userAgent: { type: String, required: true },
    timestamp: { type: Date, default: () => new Date(), index: true },
  },
  {
    // Append-only: disable updates and deletes at the schema level
    versionKey: false,
  }
);

export const AuditLogModel = models.AuditLog || model<AuditLog>('AuditLog', auditLogSchema);
