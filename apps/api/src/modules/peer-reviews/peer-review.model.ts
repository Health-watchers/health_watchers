import { Schema, Types, model, models } from 'mongoose';

export interface IPeerReview {
  encounterId: Types.ObjectId;
  reviewerId: Types.ObjectId;
  revieweeId: Types.ObjectId;
  clinicId: Types.ObjectId;
  status: 'pending' | 'in_review' | 'completed';
  rating?: number;
  feedback?: string;
  categories?: {
    documentation: number;
    diagnosis: number;
    treatment: number;
    followUp: number;
  };
  isAnonymous: boolean;
  completedAt?: Date;
}

const peerReviewSchema = new Schema<IPeerReview>(
  {
    encounterId: { type: Schema.Types.ObjectId, ref: 'Encounter', required: true },
    reviewerId:  { type: Schema.Types.ObjectId, ref: 'User',      required: true, index: true },
    revieweeId:  { type: Schema.Types.ObjectId, ref: 'User',      required: true, index: true },
    clinicId:    { type: Schema.Types.ObjectId, ref: 'Clinic',    required: true, index: true },
    status:      { type: String, enum: ['pending', 'in_review', 'completed'], default: 'pending', index: true },
    rating:      { type: Number, min: 1, max: 5 },
    feedback:    { type: String, trim: true },
    categories: {
      documentation: { type: Number, min: 1, max: 5 },
      diagnosis:     { type: Number, min: 1, max: 5 },
      treatment:     { type: Number, min: 1, max: 5 },
      followUp:      { type: Number, min: 1, max: 5 },
    },
    isAnonymous:  { type: Boolean, default: false },
    completedAt:  { type: Date },
  },
  { timestamps: true, versionKey: false }
);

peerReviewSchema.index({ clinicId: 1, status: 1 });
peerReviewSchema.index({ revieweeId: 1, clinicId: 1 });
// One review per encounter
peerReviewSchema.index({ encounterId: 1 }, { unique: true });

export const PeerReviewModel = models.PeerReview || model<IPeerReview>('PeerReview', peerReviewSchema);
