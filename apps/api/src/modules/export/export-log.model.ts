import { Schema, model, models } from 'mongoose';

export interface ExportLog {
  patientId: Schema.Types.ObjectId;
  clinicId: Schema.Types.ObjectId;
  exportedBy: Schema.Types.ObjectId;
  format: 'pdf' | 'csv' | 'json';
  exportedAt: Date;
  ipAddress?: string;
  userAgent?: string;
}

const exportLogSchema = new Schema<ExportLog>(
  {
    patientId: { type: Schema.Types.ObjectId, ref: 'Patient', required: true, index: true },
    clinicId: { type: Schema.Types.ObjectId, ref: 'Clinic', required: true, index: true },
    exportedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    format: { type: String, enum: ['pdf', 'csv', 'json'], required: true },
    exportedAt: { type: Date, default: Date.now, index: true },
    ipAddress: { type: String },
    userAgent: { type: String },
  },
  { timestamps: true, versionKey: false }
);

export const ExportLogModel = models.ExportLog || model<ExportLog>('ExportLog', exportLogSchema);
