import { Schema, Types, model, models } from 'mongoose';

export interface ICarePlanGoal {
  description: string;
  targetValue?: string;
  targetDate?: Date;
  status: 'active' | 'achieved' | 'abandoned';
}

export interface ICarePlanIntervention {
  type: 'medication' | 'lifestyle' | 'monitoring' | 'referral';
  description: string;
  frequency?: string;
}

export interface IMonitoringSchedule {
  parameter: string;
  frequency: string;
  targetRange?: string;
}

export interface ICarePlanReview {
  reviewedBy: Types.ObjectId;
  reviewedAt: Date;
  notes?: string;
  nextReviewDate?: Date;
}

export interface ICarePlan {
  patientId: Types.ObjectId;
  clinicId: Types.ObjectId;
  condition: string;
  icdCode?: string;
  goals: ICarePlanGoal[];
  interventions: ICarePlanIntervention[];
  monitoringSchedule: IMonitoringSchedule[];
  reviewDate: Date;
  reviewHistory: ICarePlanReview[];
  status: 'active' | 'completed' | 'suspended';
  createdBy: Types.ObjectId;
  aiGenerated?: boolean;
}

const goalSchema = new Schema<ICarePlanGoal>(
  {
    description: { type: String, required: true },
    targetValue: { type: String },
    targetDate: { type: Date },
    status: { type: String, enum: ['active', 'achieved', 'abandoned'], default: 'active' },
  },
  { _id: false }
);

const interventionSchema = new Schema<ICarePlanIntervention>(
  {
    type: {
      type: String,
      enum: ['medication', 'lifestyle', 'monitoring', 'referral'],
      required: true,
    },
    description: { type: String, required: true },
    frequency: { type: String },
  },
  { _id: false }
);

const monitoringSchema = new Schema<IMonitoringSchedule>(
  {
    parameter: { type: String, required: true },
    frequency: { type: String, required: true },
    targetRange: { type: String },
  },
  { _id: false }
);

const reviewSchema = new Schema<ICarePlanReview>(
  {
    reviewedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    reviewedAt: { type: Date, required: true },
    notes: { type: String },
    nextReviewDate: { type: Date },
  },
  { _id: false }
);

const carePlanSchema = new Schema<ICarePlan>(
  {
    patientId: { type: Schema.Types.ObjectId, ref: 'Patient', required: true, index: true },
    clinicId: { type: Schema.Types.ObjectId, ref: 'Clinic', required: true, index: true },
    condition: { type: String, required: true },
    icdCode: { type: String },
    goals: { type: [goalSchema], default: [] },
    interventions: { type: [interventionSchema], default: [] },
    monitoringSchedule: { type: [monitoringSchema], default: [] },
    reviewDate: { type: Date, required: true },
    reviewHistory: { type: [reviewSchema], default: [] },
    status: {
      type: String,
      enum: ['active', 'completed', 'suspended'],
      default: 'active',
      index: true,
    },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    aiGenerated: { type: Boolean, default: false },
  },
  { timestamps: true, versionKey: false }
);

export const CarePlanModel = models.CarePlan || model<ICarePlan>('CarePlan', carePlanSchema);
