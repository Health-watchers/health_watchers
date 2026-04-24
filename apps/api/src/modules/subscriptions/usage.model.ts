import { Schema, Types, model, models } from 'mongoose';

export interface IUsageRecord {
  clinicId: Types.ObjectId;
  periodStart: Date;
  periodEnd: Date;
  patientCount: number;
  encounterCount: number;
  aiRequestCount: number;
  doctorCount: number;
}

const usageSchema = new Schema<IUsageRecord>(
  {
    clinicId: { type: Schema.Types.ObjectId, ref: 'Clinic', required: true, index: true },
    periodStart: { type: Date, required: true },
    periodEnd: { type: Date, required: true },
    patientCount: { type: Number, default: 0 },
    encounterCount: { type: Number, default: 0 },
    aiRequestCount: { type: Number, default: 0 },
    doctorCount: { type: Number, default: 0 },
  },
  { timestamps: true, versionKey: false }
);

usageSchema.index({ clinicId: 1, periodStart: -1 });

export const UsageModel = models.UsageRecord || model<IUsageRecord>('UsageRecord', usageSchema);
