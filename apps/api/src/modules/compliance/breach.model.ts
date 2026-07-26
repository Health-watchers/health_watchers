import mongoose, { Schema, Document } from 'mongoose';

export interface BreachNotification extends Document {
  clinicId: mongoose.Types.ObjectId;
  breachType: string;
  description: string;
  affectedRecords: number;
  detectedAt: Date;
  notificationSentAt?: Date;
  notificationDeadline: Date; // 60 days from detection
  status: 'detected' | 'notified' | 'resolved';
  createdAt: Date;
  updatedAt: Date;
}

const breachSchema = new Schema<BreachNotification>(
  {
    clinicId: { type: Schema.Types.ObjectId, required: true, index: true },
    breachType: { type: String, required: true },
    description: { type: String, required: true },
    affectedRecords: { type: Number, required: true },
    detectedAt: { type: Date, required: true },
    notificationSentAt: Date,
    notificationDeadline: { type: Date, required: true },
    status: { type: String, enum: ['detected', 'notified', 'resolved'], default: 'detected' },
  },
  { timestamps: true }
);

export const BreachNotificationModel = mongoose.model<BreachNotification>(
  'BreachNotification',
  breachSchema
);
