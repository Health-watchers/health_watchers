import { Schema, model, models, Types } from 'mongoose';

/**
 * Recording of a telehealth session (#1249).
 *
 * Recording cannot start until **every** required participant has consented.
 * Each state change appends an immutable entry to `auditTrail` so the recording
 * carries its own tamper-evident history in addition to the central audit log.
 */
export const RECORDING_STATUSES = [
  'consent_pending',
  'consented',
  'recording',
  'stopped',
  'failed',
  'deleted',
] as const;
export type RecordingStatus = (typeof RECORDING_STATUSES)[number];

export interface IRecordingConsent {
  userId: Types.ObjectId;
  role: 'provider' | 'patient';
  consented: boolean;
  respondedAt: Date;
}

export interface IRecordingAuditEntry {
  at: Date;
  action: string;
  actorId?: Types.ObjectId;
  detail?: string;
}

export interface ITelehealthRecording {
  _id: Types.ObjectId;
  sessionId: Types.ObjectId;
  clinicId: Types.ObjectId;
  status: RecordingStatus;
  requiredConsentRoles: Array<'provider' | 'patient'>;
  consents: IRecordingConsent[];
  storageKey?: string;
  startedAt?: Date;
  stoppedAt?: Date;
  durationSeconds?: number;
  sizeBytes?: number;
  transcriptId?: Types.ObjectId;
  auditTrail: IRecordingAuditEntry[];
  createdAt: Date;
  updatedAt: Date;
}

const consentSchema = new Schema<IRecordingConsent>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    role: { type: String, enum: ['provider', 'patient'], required: true },
    consented: { type: Boolean, required: true },
    respondedAt: { type: Date, required: true },
  },
  { _id: false }
);

const auditEntrySchema = new Schema<IRecordingAuditEntry>(
  {
    at: { type: Date, required: true },
    action: { type: String, required: true },
    actorId: { type: Schema.Types.ObjectId, ref: 'User' },
    detail: { type: String },
  },
  { _id: false }
);

const telehealthRecordingSchema = new Schema<ITelehealthRecording>(
  {
    sessionId: {
      type: Schema.Types.ObjectId,
      ref: 'TelehealthSession',
      required: true,
      unique: true,
    },
    clinicId: { type: Schema.Types.ObjectId, ref: 'Clinic', required: true, index: true },
    status: { type: String, enum: RECORDING_STATUSES, default: 'consent_pending', index: true },
    requiredConsentRoles: {
      type: [String],
      enum: ['provider', 'patient'],
      default: ['provider', 'patient'],
    },
    consents: { type: [consentSchema], default: [] },
    storageKey: { type: String },
    startedAt: { type: Date },
    stoppedAt: { type: Date },
    durationSeconds: { type: Number, min: 0 },
    sizeBytes: { type: Number, min: 0 },
    transcriptId: { type: Schema.Types.ObjectId, ref: 'TelehealthTranscript' },
    auditTrail: { type: [auditEntrySchema], default: [] },
  },
  { timestamps: true, versionKey: false, collection: 'telehealth_recordings' }
);

export const TelehealthRecordingModel = (models.TelehealthRecording ||
  model<ITelehealthRecording>(
    'TelehealthRecording',
    telehealthRecordingSchema
  )) as import('mongoose').Model<ITelehealthRecording>;
