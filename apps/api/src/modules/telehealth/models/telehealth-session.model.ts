import { Schema, model, models, Types } from 'mongoose';

/**
 * A telemedicine video session (#1249).
 *
 * One session is created per telehealth appointment. It holds the video
 * provider's room handle, the negotiated feature set (screen share, chat,
 * captions, recording) and a bandwidth profile that drives client-side media
 * constraints.
 */
export const TELEHEALTH_PROVIDERS = ['mock', 'twilio', 'zoom'] as const;
export type TelehealthProvider = (typeof TELEHEALTH_PROVIDERS)[number];

export const SESSION_STATUSES = ['scheduled', 'active', 'ended', 'cancelled', 'archived'] as const;
export type SessionStatus = (typeof SESSION_STATUSES)[number];

export const BANDWIDTH_PROFILES = ['low', 'standard', 'high', 'auto'] as const;
export type BandwidthProfile = (typeof BANDWIDTH_PROFILES)[number];

export const PARTICIPANT_ROLES = ['provider', 'patient', 'observer', 'interpreter'] as const;
export type ParticipantRole = (typeof PARTICIPANT_ROLES)[number];

export interface ISessionParticipant {
  userId: Types.ObjectId;
  role: ParticipantRole;
  displayName: string;
  joinedAt?: Date;
  leftAt?: Date;
}

export interface ISessionFeatures {
  screenShare: boolean;
  chat: boolean;
  captions: boolean;
  recording: boolean;
}

export interface ITelehealthSession {
  _id: Types.ObjectId;
  appointmentId?: Types.ObjectId;
  clinicId: Types.ObjectId;
  providerId: Types.ObjectId;
  patientId: Types.ObjectId;
  videoProvider: TelehealthProvider;
  roomName: string;
  roomSid?: string;
  status: SessionStatus;
  scheduledStart: Date;
  actualStart?: Date;
  actualEnd?: Date;
  features: ISessionFeatures;
  bandwidthProfile: BandwidthProfile;
  participants: ISessionParticipant[];
  /** Populated by the archive service once the session is closed out. */
  archiveRef?: {
    recordingId?: Types.ObjectId;
    transcriptId?: Types.ObjectId;
    chatMessageCount: number;
    archivedAt: Date;
  };
  createdBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const participantSchema = new Schema<ISessionParticipant>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    role: { type: String, enum: PARTICIPANT_ROLES, required: true },
    displayName: { type: String, required: true, trim: true },
    joinedAt: { type: Date },
    leftAt: { type: Date },
  },
  { _id: false }
);

const telehealthSessionSchema = new Schema<ITelehealthSession>(
  {
    appointmentId: { type: Schema.Types.ObjectId, ref: 'Appointment', index: true },
    clinicId: { type: Schema.Types.ObjectId, ref: 'Clinic', required: true, index: true },
    providerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    patientId: { type: Schema.Types.ObjectId, ref: 'Patient', required: true, index: true },
    videoProvider: { type: String, enum: TELEHEALTH_PROVIDERS, required: true, default: 'mock' },
    roomName: { type: String, required: true, unique: true },
    roomSid: { type: String },
    status: { type: String, enum: SESSION_STATUSES, default: 'scheduled', index: true },
    scheduledStart: { type: Date, required: true },
    actualStart: { type: Date },
    actualEnd: { type: Date },
    features: {
      screenShare: { type: Boolean, default: true },
      chat: { type: Boolean, default: true },
      captions: { type: Boolean, default: false },
      recording: { type: Boolean, default: false },
    },
    bandwidthProfile: { type: String, enum: BANDWIDTH_PROFILES, default: 'auto' },
    participants: { type: [participantSchema], default: [] },
    archiveRef: {
      type: new Schema(
        {
          recordingId: { type: Schema.Types.ObjectId, ref: 'TelehealthRecording' },
          transcriptId: { type: Schema.Types.ObjectId, ref: 'TelehealthTranscript' },
          chatMessageCount: { type: Number, default: 0 },
          archivedAt: { type: Date },
        },
        { _id: false }
      ),
      default: undefined,
    },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true, versionKey: false, collection: 'telehealth_sessions' }
);

telehealthSessionSchema.index({ clinicId: 1, status: 1, scheduledStart: -1 });
telehealthSessionSchema.index({ providerId: 1, scheduledStart: -1 });

export const TelehealthSessionModel = (models.TelehealthSession ||
  model<ITelehealthSession>(
    'TelehealthSession',
    telehealthSessionSchema
  )) as import('mongoose').Model<ITelehealthSession>;
