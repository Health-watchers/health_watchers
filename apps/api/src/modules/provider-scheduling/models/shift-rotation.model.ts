import { Schema, Types, model, models } from 'mongoose';

export interface RotationEntry {
  /** Day offset from `startDate`, 0 .. cycleLengthDays-1 */
  dayOffset: number;
  providerId: Types.ObjectId;
  role: string; // e.g. "day", "night", "clinic", "ward"
}

export interface ShiftRotation {
  clinicId: Types.ObjectId;
  name: string;
  startDate: Date;
  cycleLengthDays: number;
  pattern: RotationEntry[];
  isActive: boolean;
  createdBy: Types.ObjectId;
}

const entry = new Schema<RotationEntry>(
  {
    dayOffset: { type: Number, required: true, min: 0 },
    providerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    role: { type: String, required: true },
  },
  { _id: false }
);

const schema = new Schema<ShiftRotation>(
  {
    clinicId: { type: Schema.Types.ObjectId, ref: 'Clinic', required: true },
    name: { type: String, required: true, trim: true },
    startDate: { type: Date, required: true },
    cycleLengthDays: { type: Number, required: true, min: 1 },
    pattern: { type: [entry], default: [] },
    isActive: { type: Boolean, default: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true, versionKey: false }
);

schema.index({ clinicId: 1, isActive: 1 });

export const ShiftRotationModel = (models.ShiftRotation ||
  model<ShiftRotation>('ShiftRotation', schema)) as import('mongoose').Model<ShiftRotation>;
