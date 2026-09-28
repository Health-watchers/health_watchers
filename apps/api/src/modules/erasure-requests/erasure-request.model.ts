import mongoose, { Schema, Document } from 'mongoose';

export interface IErasureRequest extends Document {
  patientId: mongoose.Types.ObjectId;
  clinicId: mongoose.Types.ObjectId;
  status: 'requested' | 'under_review' | 'approved' | 'denied' | 'executed';
  reason?: string;
  legalHoldCheckResult?: 'passed' | 'failed' | 'pending';
  legalHoldReason?: string;
  approvedBy?: mongoose.Types.ObjectId;
  approvedAt?: Date;
  deniedReason?: string;
  executedAt?: Date;
  requestedAt: Date;
  updatedAt?: Date;
}

const ErasureRequestSchema = new Schema<IErasureRequest>(
  {
    patientId: { type: Schema.Types.ObjectId, ref: 'Patient', required: true, index: true },
    clinicId: { type: Schema.Types.ObjectId, ref: 'Clinic', required: true, index: true },
    status: {
      type: String,
      enum: ['requested', 'under_review', 'approved', 'denied', 'executed'],
      default: 'requested',
      index: true,
    },
    reason: { type: String },
    legalHoldCheckResult: {
      type: String,
      enum: ['passed', 'failed', 'pending'],
      default: 'pending',
    },
    legalHoldReason: { type: String },
    approvedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    approvedAt: { type: Date },
    deniedReason: { type: String },
    executedAt: { type: Date },
    requestedAt: { type: Date, required: true, default: () => new Date() },
  },
  { timestamps: true, versionKey: false }
);

ErasureRequestSchema.index({ patientId: 1, status: 1 });
ErasureRequestSchema.index({ clinicId: 1, status: 1 });
ErasureRequestSchema.index({ requestedAt: -1 });

export const ErasureRequestModel = (mongoose.models.ErasureRequest ||
  mongoose.model<IErasureRequest>(
    'ErasureRequest',
    ErasureRequestSchema
  )) as import('mongoose').Model<IErasureRequest>;
