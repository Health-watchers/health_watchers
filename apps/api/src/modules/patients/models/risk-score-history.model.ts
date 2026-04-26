import { Schema, model, models } from 'mongoose';
import type { RiskLevel } from './patient.model';

export interface IRiskScoreHistory {
  patientId: Schema.Types.ObjectId;
  clinicId: Schema.Types.ObjectId;
  riskScore: number;
  riskLevel: RiskLevel;
  riskFactors: string[];
  recommendations?: string;
  calculatedAt: Date;
  source: 'manual' | 'scheduled' | 'ai';
}

const riskScoreHistorySchema = new Schema<IRiskScoreHistory>(
  {
    patientId:       { type: Schema.Types.ObjectId, ref: 'Patient', required: true, index: true },
    clinicId:        { type: Schema.Types.ObjectId, ref: 'Clinic',  required: true, index: true },
    riskScore:       { type: Number, required: true, min: 0, max: 100 },
    riskLevel:       { type: String, enum: ['low', 'medium', 'high', 'critical'], required: true },
    riskFactors:     { type: [String], default: [] },
    recommendations: { type: String },
    calculatedAt:    { type: Date, default: () => new Date() },
    source:          { type: String, enum: ['manual', 'scheduled', 'ai'], default: 'ai' },
  },
  { timestamps: false, versionKey: false },
);

riskScoreHistorySchema.index({ patientId: 1, calculatedAt: -1 });

export const RiskScoreHistoryModel =
  models.RiskScoreHistory || model<IRiskScoreHistory>('RiskScoreHistory', riskScoreHistorySchema);
