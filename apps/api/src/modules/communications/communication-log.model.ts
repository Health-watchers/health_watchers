import { Schema, Types, model, models } from 'mongoose';

export type CommunicationChannel = 'sms' | 'whatsapp' | 'email' | 'phone_call' | 'in_person';
export type CommunicationDirection = 'outbound' | 'inbound';
export type CommunicationStatus = 'sent' | 'delivered' | 'failed' | 'read';

export interface ICommunicationLog {
  _id: Types.ObjectId;
  patientId: Types.ObjectId;
  clinicId: Types.ObjectId;
  sentBy: Types.ObjectId;
  channel: CommunicationChannel;
  direction: CommunicationDirection;
  content: string;
  status: CommunicationStatus;
  sentAt: Date;
  deliveredAt?: Date;
  readAt?: Date;
  relatedEncounterId?: Types.ObjectId;
  twilioMessageSid?: string;
  createdAt: Date;
  updatedAt: Date;
}

const communicationLogSchema = new Schema<ICommunicationLog>(
  {
    patientId: { type: Schema.Types.ObjectId, ref: 'Patient', required: true, index: true },
    clinicId: { type: Schema.Types.ObjectId, ref: 'Clinic', required: true, index: true },
    sentBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    channel: {
      type: String,
      enum: ['sms', 'whatsapp', 'email', 'phone_call', 'in_person'],
      required: true,
    },
    direction: {
      type: String,
      enum: ['outbound', 'inbound'],
      required: true,
    },
    content: { type: String, required: true },
    status: {
      type: String,
      enum: ['sent', 'delivered', 'failed', 'read'],
      required: true,
    },
    sentAt: { type: Date, required: true },
    deliveredAt: { type: Date, required: false },
    readAt: { type: Date, required: false },
    relatedEncounterId: { type: Schema.Types.ObjectId, ref: 'Encounter', required: false },
    twilioMessageSid: { type: String, required: false },
  },
  {
    timestamps: true,
    versionKey: false,
    collection: 'communication_logs',
  }
);

// Indexes for efficient querying
communicationLogSchema.index({ patientId: 1, clinicId: 1, sentAt: -1 });
communicationLogSchema.index({ clinicId: 1 });
communicationLogSchema.index({ patientId: 1, channel: 1 });

export const CommunicationLogModel = (models.CommunicationLog ||
  model<ICommunicationLog>(
    'CommunicationLog',
    communicationLogSchema
  )) as import('mongoose').Model<ICommunicationLog>;
