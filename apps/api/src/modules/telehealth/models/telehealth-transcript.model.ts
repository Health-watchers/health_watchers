import { Schema, model, models, Types } from 'mongoose';

/**
 * Speech-to-text transcript for a telehealth session / recording (#1249).
 * Also backs the live-caption accessibility feature.
 */
export const TRANSCRIPT_STATUSES = ['queued', 'processing', 'completed', 'failed'] as const;
export type TranscriptStatus = (typeof TRANSCRIPT_STATUSES)[number];

export interface ITranscriptSegment {
  speaker: string;
  text: string;
  startMs: number;
  endMs: number;
}

export interface ITelehealthTranscript {
  _id: Types.ObjectId;
  sessionId: Types.ObjectId;
  recordingId?: Types.ObjectId;
  clinicId: Types.ObjectId;
  language: string;
  status: TranscriptStatus;
  provider: string;
  segments: ITranscriptSegment[];
  error?: string;
  completedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const segmentSchema = new Schema<ITranscriptSegment>(
  {
    speaker: { type: String, required: true },
    text: { type: String, required: true },
    startMs: { type: Number, required: true, min: 0 },
    endMs: { type: Number, required: true, min: 0 },
  },
  { _id: false }
);

const telehealthTranscriptSchema = new Schema<ITelehealthTranscript>(
  {
    sessionId: {
      type: Schema.Types.ObjectId,
      ref: 'TelehealthSession',
      required: true,
      index: true,
    },
    recordingId: { type: Schema.Types.ObjectId, ref: 'TelehealthRecording', index: true },
    clinicId: { type: Schema.Types.ObjectId, ref: 'Clinic', required: true, index: true },
    language: { type: String, default: 'en' },
    status: { type: String, enum: TRANSCRIPT_STATUSES, default: 'queued', index: true },
    provider: { type: String, default: 'mock' },
    segments: { type: [segmentSchema], default: [] },
    error: { type: String },
    completedAt: { type: Date },
  },
  { timestamps: true, versionKey: false, collection: 'telehealth_transcripts' }
);

export const TelehealthTranscriptModel = (models.TelehealthTranscript ||
  model<ITelehealthTranscript>(
    'TelehealthTranscript',
    telehealthTranscriptSchema
  )) as import('mongoose').Model<ITelehealthTranscript>;
