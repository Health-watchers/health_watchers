import { Schema, model } from 'mongoose';

const triageQueueSchema = new Schema(
  {
    clinicId: { type: Schema.Types.ObjectId, required: true, index: true },
    patientId: { type: Schema.Types.ObjectId, required: true },
    chiefComplaint: String,
    symptoms: [String],
    vitalSigns: {
      heartRate: Number,
      bloodPressure: String,
      temperature: Number,
      oxygenSaturation: Number,
    },
    patientAge: Number,
    patientSex: { type: String, enum: ['M', 'F'] },
    onsetTime: String,
    urgencyLevel: {
      type: String,
      enum: ['immediate', 'urgent', 'semi-urgent', 'non-urgent'],
      index: true,
    },
    triageScore: { type: Number, min: 1, max: 5 },
    reasoning: String,
    redFlags: [String],
    recommendedActions: [String],
    estimatedWaitTime: String,
    status: { type: String, enum: ['pending', 'seen', 'discharged'], default: 'pending' },
    arrivalTime: { type: Date, default: Date.now, index: true },
  },
  { timestamps: true }
);

triageQueueSchema.index({ clinicId: 1, urgencyLevel: 1, arrivalTime: 1 });

export const TriageQueue = model('TriageQueue', triageQueueSchema);
