/**
 * Mongoose model for persisted export schedules (Issue #1243).
 */
import { Schema, model, models, Types } from 'mongoose';

export interface IExportSchedule {
  _id?: Types.ObjectId;
  clinicId: Types.ObjectId | string;
  name: string;
  cronExpression: string;
  format: 'json' | 'csv' | 'fhir' | 'hl7v2';
  patientId?: Types.ObjectId | string;
  encrypt: boolean;
  sign: boolean;
  isEnabled: boolean;
  createdBy: Types.ObjectId | string;
  lastRunAt?: Date;
  lastRunStatus?: 'success' | 'failed';
  lastRunError?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

const exportScheduleSchema = new Schema<IExportSchedule>(
  {
    clinicId: { type: Schema.Types.ObjectId, ref: 'Clinic', required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    cronExpression: { type: String, required: true },
    format: {
      type: String,
      enum: ['json', 'csv', 'fhir', 'hl7v2'],
      required: true,
      default: 'json',
    },
    patientId: { type: Schema.Types.ObjectId, ref: 'Patient', index: true },
    encrypt: { type: Boolean, default: false },
    sign: { type: Boolean, default: false },
    isEnabled: { type: Boolean, default: true, index: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    lastRunAt: { type: Date },
    lastRunStatus: { type: String, enum: ['success', 'failed'] },
    lastRunError: { type: String },
  },
  { timestamps: true, versionKey: false }
);

export const ExportScheduleModel = (
  models.ExportSchedule || model<IExportSchedule>('ExportSchedule', exportScheduleSchema)
) as import('mongoose').Model<IExportSchedule>;
