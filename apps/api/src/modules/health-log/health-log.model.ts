import mongoose, { Document, Schema } from 'mongoose';

export type MetricType =
  | 'weight'
  | 'blood_pressure'
  | 'blood_glucose'
  | 'exercise_minutes'
  | 'heart_rate';

export interface IPatientHealthLog extends Document {
  patientId: mongoose.Types.ObjectId;
  metricType: MetricType;
  value: number;
  unit: string;
  loggedAt: Date;
  notes?: string;
  flagged: boolean;
}

const PatientHealthLogSchema = new Schema<IPatientHealthLog>(
  {
    patientId: { type: Schema.Types.ObjectId, ref: 'Patient', required: true, index: true },
    metricType: {
      type: String,
      enum: ['weight', 'blood_pressure', 'blood_glucose', 'exercise_minutes', 'heart_rate'],
      required: true,
    },
    value: { type: Number, required: true },
    unit: { type: String, required: true },
    loggedAt: { type: Date, required: true, default: Date.now },
    notes: { type: String, maxlength: 500 },
    flagged: { type: Boolean, default: false },
  },
  { timestamps: true },
);

PatientHealthLogSchema.index({ patientId: 1, metricType: 1, loggedAt: -1 });

export const PatientHealthLogModel = mongoose.model<IPatientHealthLog>(
  'PatientHealthLog',
  PatientHealthLogSchema,
);
