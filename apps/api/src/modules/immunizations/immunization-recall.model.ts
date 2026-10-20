import mongoose, { Schema, Document, Types } from 'mongoose';

export type RecallSeverity = 'low' | 'medium' | 'high' | 'critical';
export type RecallStatus = 'active' | 'resolved';

export interface IImmunizationRecall extends Document {
  clinicId: Types.ObjectId;
  lotNumber: string;
  vaccineCode: string;
  vaccineName: string;
  manufacturer: string;
  reason: string;
  severity: RecallSeverity;
  status: RecallStatus;
  initiatedBy: string;
  recalledAt: Date;
  resolvedAt?: Date;
  resolvedBy?: string;
  /** Number of patients who received doses from the recalled lot. */
  affectedPatientCount: number;
  /** Whether patients affected by the recall have been notified. */
  patientsNotified: boolean;
  notifiedAt?: Date;
}

const ImmunizationRecallSchema = new Schema<IImmunizationRecall>(
  {
    clinicId: { type: Schema.Types.ObjectId, ref: 'Clinic', required: true, index: true },
    lotNumber: { type: String, required: true, trim: true, index: true },
    vaccineCode: { type: String, required: true, trim: true },
    vaccineName: { type: String, required: true, trim: true },
    manufacturer: { type: String, required: true, trim: true },
    reason: { type: String, required: true, trim: true, maxlength: 2000 },
    severity: { type: String, enum: ['low', 'medium', 'high', 'critical'], required: true },
    status: { type: String, enum: ['active', 'resolved'], default: 'active', index: true },
    initiatedBy: { type: String, required: true },
    recalledAt: { type: Date, default: Date.now },
    resolvedAt: { type: Date },
    resolvedBy: { type: String },
    affectedPatientCount: { type: Number, min: 0, default: 0 },
    patientsNotified: { type: Boolean, default: false },
    notifiedAt: { type: Date },
  },
  { timestamps: true, versionKey: false }
);

ImmunizationRecallSchema.index({ clinicId: 1, lotNumber: 1, status: 1 });

export const ImmunizationRecallModel = (mongoose.models.ImmunizationRecall ||
  mongoose.model<IImmunizationRecall>(
    'ImmunizationRecall',
    ImmunizationRecallSchema
  )) as import('mongoose').Model<IImmunizationRecall>;
