import { Schema, model, models } from 'mongoose';

export interface ISurveyResponses {
  overallSatisfaction: number; // 1-5
  waitTime: number; // 1-5
  doctorCommunication: number; // 1-5
  staffFriendliness: number; // 1-5
  facilityCleanness: number; // 1-5
  wouldRecommend: boolean;
  comments?: string;
}

export interface ISurvey {
  encounterId: Schema.Types.ObjectId;
  patientId: Schema.Types.ObjectId;
  clinicId: Schema.Types.ObjectId;
  doctorId: Schema.Types.ObjectId;
  token: string;
  sentAt: Date;
  completedAt?: Date;
  responses?: ISurveyResponses;
  status: 'pending' | 'completed' | 'expired';
  expiresAt: Date;
}

const surveyResponsesSchema = new Schema<ISurveyResponses>(
  {
    overallSatisfaction: { type: Number, min: 1, max: 5, required: true },
    waitTime: { type: Number, min: 1, max: 5, required: true },
    doctorCommunication: { type: Number, min: 1, max: 5, required: true },
    staffFriendliness: { type: Number, min: 1, max: 5, required: true },
    facilityCleanness: { type: Number, min: 1, max: 5, required: true },
    wouldRecommend: { type: Boolean, required: true },
    comments: { type: String, maxlength: 500 },
  },
  { _id: false }
);

const surveySchema = new Schema<ISurvey>(
  {
    encounterId: { type: Schema.Types.ObjectId, ref: 'Encounter', required: true, index: true },
    patientId: { type: Schema.Types.ObjectId, ref: 'Patient', required: true, index: true },
    clinicId: { type: Schema.Types.ObjectId, ref: 'Clinic', required: true, index: true },
    doctorId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    token: { type: String, required: true, unique: true, index: true },
    sentAt: { type: Date, default: () => new Date() },
    completedAt: { type: Date },
    responses: { type: surveyResponsesSchema },
    status: {
      type: String,
      enum: ['pending', 'completed', 'expired'],
      default: 'pending',
      index: true,
    },
    expiresAt: { type: Date, required: true, index: true },
  },
  { timestamps: true, versionKey: false }
);

surveySchema.index({ status: 1, expiresAt: 1 });
surveySchema.index({ clinicId: 1, doctorId: 1, completedAt: 1 });

export const SurveyModel = models.Survey || model<ISurvey>('Survey', surveySchema);
