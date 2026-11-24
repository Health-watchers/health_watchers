import { Schema, Types, model, models } from 'mongoose';

export type OnCallRole = 'primary' | 'backup';

export interface OnCallSchedule {
  clinicId: Types.ObjectId;
  providerId: Types.ObjectId;
  start: Date;
  end: Date;
  role: OnCallRole;
  contact?: string;
  createdBy: Types.ObjectId;
}

const schema = new Schema<OnCallSchedule>(
  {
    clinicId: { type: Schema.Types.ObjectId, ref: 'Clinic', required: true },
    providerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    start: { type: Date, required: true },
    end: { type: Date, required: true },
    role: { type: String, enum: ['primary', 'backup'], default: 'primary' },
    contact: { type: String },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true, versionKey: false }
);

schema.index({ clinicId: 1, start: 1, end: 1 });
schema.index({ providerId: 1, start: 1 });

export const OnCallScheduleModel = (models.OnCallSchedule ||
  model<OnCallSchedule>('OnCallSchedule', schema)) as import('mongoose').Model<OnCallSchedule>;
