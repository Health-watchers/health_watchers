import { Schema, Types, model, models } from 'mongoose';
import { sanitizeText } from '@api/utils/sanitize';

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

function sanitizeGoals(goals: unknown): void {
  if (!Array.isArray(goals)) return;
  for (const g of goals) if (g?.description) g.description = sanitizeText(g.description);
}

function sanitizeInterventions(interventions: unknown): void {
  if (!Array.isArray(interventions)) return;
  for (const i of interventions) if (i?.description) i.description = sanitizeText(i.description);
}

function sanitizeReviewHistory(reviewHistory: unknown): void {
  if (!Array.isArray(reviewHistory)) return;
  for (const r of reviewHistory) if (r?.notes) r.notes = sanitizeText(r.notes);
}

carePlanSchema.pre('save', function () {
  if (this.condition) this.condition = sanitizeText(this.condition);
  sanitizeGoals(this.goals);
  sanitizeInterventions(this.interventions);
  sanitizeReviewHistory(this.reviewHistory);
});

// Covers PUT /:id (direct field update) and POST /:id/review ($push onto reviewHistory)
carePlanSchema.pre('findOneAndUpdate', function () {
  const update = this.getUpdate() as any;
  if (!update) return;

  for (const target of [update, update.$set]) {
    if (!target) continue;
    if (target.condition) target.condition = sanitizeText(target.condition);
    sanitizeGoals(target.goals);
    sanitizeInterventions(target.interventions);
    sanitizeReviewHistory(target.reviewHistory);
  }

  const pushedReview = update.$push?.reviewHistory;
  if (pushedReview?.notes) pushedReview.notes = sanitizeText(pushedReview.notes);
});

export const CarePlanModel = (models.CarePlan ||
  model<ICarePlan>('CarePlan', carePlanSchema)) as import('mongoose').Model<ICarePlan>;
