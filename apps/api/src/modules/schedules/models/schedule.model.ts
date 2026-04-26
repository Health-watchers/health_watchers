import { Schema, model, models } from 'mongoose';

export interface Schedule {
  userId: string;
  clinicId: string;
  date: Date;
  shiftStart: string; // HH:MM format
  shiftEnd: string; // HH:MM format
  role: 'DOCTOR' | 'NURSE' | 'ASSISTANT';
  isOnCall: boolean;
  notes?: string;
  status: 'scheduled' | 'confirmed' | 'absent' | 'cancelled';
  createdBy: string;
  updatedBy?: string;
}

const scheduleSchema = new Schema<Schedule>(
  {
    userId: { type: String, required: true, index: true },
    clinicId: { type: String, required: true, index: true },
    date: { type: Date, required: true, index: true },
    shiftStart: { type: String, required: true },
    shiftEnd: { type: String, required: true },
    role: {
      type: String,
      enum: ['DOCTOR', 'NURSE', 'ASSISTANT'],
      required: true,
    },
    isOnCall: { type: Boolean, default: false },
    notes: { type: String },
    status: {
      type: String,
      enum: ['scheduled', 'confirmed', 'absent', 'cancelled'],
      default: 'scheduled',
      index: true,
    },
    createdBy: { type: String, required: true },
    updatedBy: { type: String },
  },
  { timestamps: true, versionKey: false }
);

// Compound index for efficient queries
scheduleSchema.index({ clinicId: 1, date: 1, userId: 1 });
scheduleSchema.index({ clinicId: 1, date: 1, role: 1 });
scheduleSchema.index({ userId: 1, date: 1 });

export const ScheduleModel = models.Schedule || model<Schedule>('Schedule', scheduleSchema);
