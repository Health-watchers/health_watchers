import { emitToUser } from '@api/realtime/socket';
import {
  TelehealthChatMessageModel,
  ITelehealthChatMessage,
} from './models/telehealth-chat-message.model';
import { TelehealthSessionModel } from './models/telehealth-session.model';
import { Actor } from './telehealth-session.service';

export interface PostMessageInput {
  sessionId: string;
  senderId: string;
  senderRole: string;
  senderName: string;
  message: string;
  system?: boolean;
}

export async function postMessage(
  input: PostMessageInput,
  actor: Actor
): Promise<ITelehealthChatMessage> {
  const session = await TelehealthSessionModel.findOne({
    _id: input.sessionId,
    clinicId: actor.clinicId,
  }).lean();
  if (!session) throw new Error('Telehealth session not found');
  if (!session.features.chat) throw new Error('Chat is disabled for this session');

  const chatMessage = await TelehealthChatMessageModel.create({
    sessionId: input.sessionId,
    clinicId: actor.clinicId,
    senderId: input.senderId,
    senderRole: input.senderRole,
    senderName: input.senderName,
    message: input.message,
    system: input.system ?? false,
    sentAt: new Date(),
  });

  // Fan the message out to the other participants' sockets.
  for (const participant of session.participants) {
    if (String(participant.userId) === input.senderId) continue;
    try {
      emitToUser(String(participant.userId), 'telehealth:chat', {
        sessionId: input.sessionId,
        messageId: String(chatMessage._id),
        senderName: input.senderName,
        message: chatMessage.message,
        sentAt: chatMessage.sentAt,
      });
    } catch {
      // socket not initialised — non-fatal
    }
  }

  return chatMessage.toObject();
}

export async function listMessages(
  sessionId: string,
  clinicId: string
): Promise<ITelehealthChatMessage[]> {
  return TelehealthChatMessageModel.find({ sessionId, clinicId })
    .sort({ sentAt: 1 })
    .lean<ITelehealthChatMessage[]>();
}
