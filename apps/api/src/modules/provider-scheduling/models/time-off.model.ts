import { Schema, Types, model, models } from 'mongoose';

export type TimeOffType = 'vacation' | 'sick' | 'conference' | 'personal' | 'other';
export type TimeOffStatus = 'pending' | 'approved' | 'denied' | 'cancelled';

export interface TimeOff {
  providerId: Types.ObjectId;
  clinicId: Types.ObjectId;
  start: Date;
  end: Date;
  type: TimeOffType;
  status: TimeOffStatus;
  reason?: string;
  requestedBy: Types.ObjectId;
  reviewedBy?: Types.ObjectId;
  reviewedAt?: Date;
  reviewNote?: string;
}

const schema = new Schema<TimeOff>(
  {
    providerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    clinicId: { type: Schema.Types.ObjectId, ref: 'Clinic', required: true },
    start: { type: Date, required: true },
    end: { type: Date, required: true },
    type: {
      type: String,
      enum: ['vacation', 'sick', 'conference', 'personal', 'other'],
      required: true,
    },
    status: {
      type: String,
      enum: ['pending', 'approved', 'denied', 'cancelled'],
      default: 'pending',
      index: true,
    },
    reason: { type: String },
    requestedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    reviewedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    reviewedAt: { type: Date },
    reviewNote: { type: String },
  },
  { timestamps: true, versionKey: false }
);

schema.index({ providerId: 1, start: 1, end: 1 });
schema.index({ clinicId: 1, status: 1, start: 1 });

export const TimeOffModel = (models.TimeOff ||
  model<TimeOff>('TimeOff', schema)) as import('mongoose').Model<TimeOff>;
