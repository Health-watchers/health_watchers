import { Schema, Types, model, models } from 'mongoose';
import type { DayHours } from './provider-availability.model';

export interface ScheduleTemplate {
  clinicId: Types.ObjectId;
  name: string;
  description?: string;
  weeklyHours: DayHours[];
  slotDurationMinutes: number;
  bufferMinutes: number;
  createdBy: Types.ObjectId;
}

const timeBlock = new Schema(
  { start: { type: String, required: true }, end: { type: String, required: true } },
  { _id: false }
);

const dayHours = new Schema(
  {
    dayOfWeek: { type: Number, required: true, min: 0, max: 6 },
    blocks: { type: [timeBlock], default: [] },
  },
  { _id: false }
);

const schema = new Schema<ScheduleTemplate>(
  {
    clinicId: { type: Schema.Types.ObjectId, ref: 'Clinic', required: true },
    name: { type: String, required: true, trim: true },
    description: { type: String },
    weeklyHours: { type: [dayHours], default: [] },
    slotDurationMinutes: { type: Number, default: 30, min: 5 },
    bufferMinutes: { type: Number, default: 0, min: 0 },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true, versionKey: false }
);

schema.index({ clinicId: 1, name: 1 }, { unique: true });

export const ScheduleTemplateModel = (models.ScheduleTemplate ||
  model<ScheduleTemplate>(
    'ScheduleTemplate',
    schema
  )) as import('mongoose').Model<ScheduleTemplate>;
