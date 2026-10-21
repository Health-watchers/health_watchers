import { Schema, model, models, Types } from 'mongoose';
import { sanitizeText } from '@api/utils/sanitize';

/**
 * In-meeting chat message for a telehealth session (#1249).
 * Retained with the session so it can be included in the meeting archive.
 */
export interface ITelehealthChatMessage {
  _id: Types.ObjectId;
  sessionId: Types.ObjectId;
  clinicId: Types.ObjectId;
  senderId: Types.ObjectId;
  senderRole: string;
  senderName: string;
  message: string;
  system: boolean;
  sentAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const telehealthChatMessageSchema = new Schema<ITelehealthChatMessage>(
  {
    sessionId: {
      type: Schema.Types.ObjectId,
      ref: 'TelehealthSession',
      required: true,
      index: true,
    },
    clinicId: { type: Schema.Types.ObjectId, ref: 'Clinic', required: true, index: true },
    senderId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    senderRole: { type: String, required: true },
    senderName: { type: String, required: true },
    message: { type: String, required: true, maxlength: 4000 },
    system: { type: Boolean, default: false },
    sentAt: { type: Date, required: true, default: (): Date => new Date() },
  },
  { timestamps: true, versionKey: false, collection: 'telehealth_chat_messages' }
);

telehealthChatMessageSchema.pre('save', function (): void {
  if (this.message) this.message = sanitizeText(this.message);
});

telehealthChatMessageSchema.index({ sessionId: 1, sentAt: 1 });

export const TelehealthChatMessageModel = (models.TelehealthChatMessage ||
  model<ITelehealthChatMessage>(
    'TelehealthChatMessage',
    telehealthChatMessageSchema
  )) as import('mongoose').Model<ITelehealthChatMessage>;
