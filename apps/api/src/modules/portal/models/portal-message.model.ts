import { Schema, Types, model, models } from 'mongoose';
import { AppRole } from '@api/types/express';

export interface Attachment {
  fileName: string;
  url: string;
  mimeType?: string;
  size?: number;
}

export interface PortalMessage {
  clinicId: Types.ObjectId;
  patientId: Types.ObjectId;
  senderId: Types.ObjectId;
  senderRole: AppRole;
  subject: string;
  body: string;
  direction: 'patient_to_staff' | 'staff_to_patient';
  threadId: Types.ObjectId;
  parentMessageId?: Types.ObjectId;
  attachments?: Attachment[];
  readAt?: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

const attachmentSchema = new Schema(
  {
    fileName: { type: String, required: true },
    url: { type: String, required: true },
    mimeType: { type: String, required: false },
    size: { type: Number, required: false },
  },
  { _id: false }
);

const portalMessageSchema = new Schema(
  {
    clinicId: { type: Schema.Types.ObjectId, ref: 'Clinic', required: true, index: true },
    patientId: { type: Schema.Types.ObjectId, ref: 'Patient', required: true, index: true },
    senderId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    senderRole: {
      type: String,
      enum: ['SUPER_ADMIN', 'CLINIC_ADMIN', 'DOCTOR', 'NURSE', 'ASSISTANT', 'READ_ONLY', 'PATIENT'],
      required: true,
    },
    subject: { type: String, required: true, trim: true },
    body: { type: String, required: true, trim: true },
    direction: {
      type: String,
      enum: ['patient_to_staff', 'staff_to_patient'],
      required: true,
    },
    threadId: { type: Schema.Types.ObjectId, required: true, index: true },
    parentMessageId: { type: Schema.Types.ObjectId, ref: 'PortalMessage', required: false },
    attachments: { type: [attachmentSchema], required: false, default: undefined },
    readAt: { type: Date, required: false, default: undefined },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

portalMessageSchema.index({ clinicId: 1, patientId: 1, threadId: 1 });
portalMessageSchema.index({ clinicId: 1, patientId: 1, createdAt: -1 });
portalMessageSchema.index({ subject: 'text', body: 'text' });

export const PortalMessageModel = models.PortalMessage || model<PortalMessage>('PortalMessage', portalMessageSchema);
