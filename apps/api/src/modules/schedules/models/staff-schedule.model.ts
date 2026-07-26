
import mongoose, { Schema, Document } from 'mongoose';

export type RecurrenceType = 'none' | 'daily' | 'weekly' | 'biweekly' | 'monthly';

export interface IStaffSchedule extends Document {
  userId: mongoose.Types.ObjectId;
  clinicId: mongoose.Types.ObjectId;
  date?: Date; // For one-time schedules
  dayOfWeek?: number; // For recurring schedules (0 = Sunday, 6 = Saturday)
  startTime: string; // HH:mm (24h format)
  endTime: string; // HH:mm (24h format)
  isAvailable: boolean; // true = available, false = unavailable
  recurrence: RecurrenceType;
  recurrenceEndDate?: Date; // End date for recurring schedules
  notes?: string;
}

const StaffScheduleSchema = new Schema<IStaffSchedule>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    clinicId: { type: Schema.Types.ObjectId, ref: 'Clinic', required: true },
    date: { type: Date },
    dayOfWeek: { type: Number, min: 0, max: 6 },
    startTime: { type: String, required: true },
    endTime: { type: String, required: true },
    isAvailable: { type: Boolean, required: true, default: true },
    recurrence: { 
      type: String, 
      enum: ['none', 'daily', 'weekly', 'biweekly', 'monthly'], 
      required: true, 
      default: 'none' 
    },
    recurrenceEndDate: { type: Date },
    notes: { type: String },
  },
  { timestamps: true, versionKey: false }
);

// Indexes for efficient queries
StaffScheduleSchema.index({ userId: 1, clinicId: 1 });
StaffScheduleSchema.index({ clinicId: 1, date: 1 });
StaffScheduleSchema.index({ clinicId: 1, dayOfWeek: 1 });

export const StaffScheduleModel = (mongoose.models.StaffSchedule ||
  mongoose.model<IStaffSchedule>(
    'StaffSchedule',
    StaffScheduleSchema
  )) as import('mongoose').Model<IStaffSchedule>;
