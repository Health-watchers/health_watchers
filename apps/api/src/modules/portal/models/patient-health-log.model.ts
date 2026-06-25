import { Schema, model, models } from 'mongoose';

export type MetricType = 'weight' | 'blood_pressure' | 'blood_glucose' | 'exercise';

export interface IPatientHealthLog {
  patientId: Schema.Types.ObjectId;
  metricType: MetricType;
  value: number;
  /** For blood_pressure, store diastolic here; systolic goes in `value` */
  valueDiastolic?: number;
  unit: string;
  loggedAt: Date;
  notes?: string;
  /** Populated by alert logic */
  isAlert?: boolean;
}

const patientHealthLogSchema = new Schema<IPatientHealthLog>(
  {
    patientId:       { type: Schema.Types.ObjectId, ref: 'Patient', required: true, index: true },
    metricType:      { type: String, enum: ['weight', 'blood_pressure', 'blood_glucose', 'exercise'], required: true, index: true },
    value:           { type: Number, required: true },
    valueDiastolic:  { type: Number },
    unit:            { type: String, required: true },
    loggedAt:        { type: Date, default: Date.now, index: true },
    notes:           { type: String, maxlength: 1000 },
    isAlert:         { type: Boolean, default: false },
  },
  { timestamps: true, versionKey: false }
);

patientHealthLogSchema.index({ patientId: 1, metricType: 1, loggedAt: -1 });

export const PatientHealthLogModel =
  models.PatientHealthLog || model<IPatientHealthLog>('PatientHealthLog', patientHealthLogSchema);
