import { Schema, model, models } from 'mongoose';

export interface IHealthScoreFactor {
  name: string;
  points: number;
  weight: number;
}

export interface IHealthScoreHistory {
  score: number;
  calculatedAt: Date;
  factors: IHealthScoreFactor[];
}

export interface IHealthScore {
  patientId: Schema.Types.ObjectId;
  clinicId: Schema.Types.ObjectId;
  healthScore: number;
  healthScoreHistory: IHealthScoreHistory[];
  healthScoreLastCalculated: Date;
}

const healthScoreFactorSchema = new Schema<IHealthScoreFactor>(
  {
    name: { type: String, required: true },
    points: { type: Number, required: true },
    weight: { type: Number, required: true },
  },
  { _id: false }
);

const healthScoreHistorySchema = new Schema<IHealthScoreHistory>(
  {
    score: { type: Number, required: true, min: 0, max: 100 },
    calculatedAt: { type: Date, default: () => new Date() },
    factors: { type: [healthScoreFactorSchema], default: [] },
  },
  { _id: false }
);

const healthScoreSchema = new Schema<IHealthScore>(
  {
    patientId: {
      type: Schema.Types.ObjectId,
      ref: 'Patient',
      required: true,
      unique: true,
      index: true,
    },
    clinicId: { type: Schema.Types.ObjectId, ref: 'Clinic', required: true, index: true },
    healthScore: { type: Number, required: true, min: 0, max: 100, default: 50 },
    healthScoreHistory: { type: [healthScoreHistorySchema], default: [] },
    healthScoreLastCalculated: { type: Date, default: () => new Date() },
  },
  { timestamps: true, versionKey: false }
);

healthScoreSchema.index({ clinicId: 1, healthScore: 1 });
healthScoreSchema.index({ healthScoreLastCalculated: 1 });

export const HealthScoreModel = (models.HealthScore ||
  model<IHealthScore>('HealthScore', healthScoreSchema)) as import('mongoose').Model<IHealthScore>;
