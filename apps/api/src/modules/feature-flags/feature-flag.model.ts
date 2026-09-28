import mongoose, { Schema, Document } from 'mongoose';

export interface IFeatureFlag extends Document {
  key: string;
  name: string;
  description?: string;
  default: boolean;
  enabled: boolean;
  rolloutPercentage: number; // 0-100
  clinicOverrides: Array<{
    clinicId: mongoose.Types.ObjectId;
    enabled: boolean;
    rolloutPercentage: number;
  }>;
  createdBy: mongoose.Types.ObjectId;
  updatedBy?: mongoose.Types.ObjectId;
  createdAt?: Date;
  updatedAt?: Date;
}

const FeatureFlagSchema = new Schema<IFeatureFlag>(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      index: true,
    },
    name: { type: String, required: true },
    description: { type: String },
    default: { type: Boolean, default: false },
    enabled: { type: Boolean, default: false, index: true },
    rolloutPercentage: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },
    clinicOverrides: [
      {
        clinicId: { type: Schema.Types.ObjectId, ref: 'Clinic', required: true },
        enabled: { type: Boolean, required: true },
        rolloutPercentage: { type: Number, default: 0, min: 0, max: 100 },
      },
    ],
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true, versionKey: false }
);

FeatureFlagSchema.index({ key: 1, enabled: 1 });
FeatureFlagSchema.index({ clinicOverrides: 1 });

export const FeatureFlagModel = (mongoose.models.FeatureFlag ||
  mongoose.model<IFeatureFlag>(
    'FeatureFlag',
    FeatureFlagSchema
  )) as import('mongoose').Model<IFeatureFlag>;
