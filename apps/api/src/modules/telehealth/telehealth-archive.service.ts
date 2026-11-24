import { auditLog } from '../audit/audit.service';
import { paginate, PaginationMeta } from '@api/utils/paginate';
import { TelehealthSessionModel, ITelehealthSession } from './models/telehealth-session.model';
import { TelehealthRecordingModel } from './models/telehealth-recording.model';
import { TelehealthTranscriptModel } from './models/telehealth-transcript.model';
import { TelehealthChatMessageModel } from './models/telehealth-chat-message.model';
import { Actor } from './telehealth-session.service';
import { recordTelehealthSessionEvent } from '@api/monitoring/custom-metrics';

export interface SessionArchive {
  session: ITelehealthSession;
  recording: unknown | null;
  transcript: unknown | null;
  chatMessages: unknown[];
}

/**
 * Close a finished session out into the archive: bundle recording, transcript
 * and chat references onto the session and mark it `archived` (#1249).
 */
export async function archiveSession(sessionId: string, actor: Actor): Promise<ITelehealthSession> {
  const session = await TelehealthSessionModel.findOne({
    _id: sessionId,
    clinicId: actor.clinicId,
  });
  if (!session) throw new Error('Telehealth session not found');
  if (session.status !== 'ended') {
    throw new Error(`Only ended sessions can be archived (current status: ${session.status})`);
  }

  const [recording, transcript, chatCount] = await Promise.all([
    TelehealthRecordingModel.findOne({ sessionId }).select('_id').lean(),
    TelehealthTranscriptModel.findOne({ sessionId }).select('_id').lean(),
    TelehealthChatMessageModel.countDocuments({ sessionId }),
  ]);

  session.status = 'archived';
  session.archiveRef = {
    recordingId: recording?._id,
    transcriptId: transcript?._id,
    chatMessageCount: chatCount,
    archivedAt: new Date(),
  };
  await session.save();

  await auditLog({
    userId: actor.userId,
    clinicId: actor.clinicId,
    action: 'TELEHEALTH_SESSION_ARCHIVE',
    resourceType: 'TelehealthSession',
    resourceId: String(session._id),
    outcome: 'SUCCESS',
    metadata: {
      hasRecording: Boolean(recording),
      hasTranscript: Boolean(transcript),
      chatMessageCount: chatCount,
    },
  });

  recordTelehealthSessionEvent('archived');
  return session.toObject();
}

export async function getSessionArchive(
  sessionId: string,
  clinicId: string
): Promise<SessionArchive | null> {
  const session = await TelehealthSessionModel.findOne({
    _id: sessionId,
    clinicId,
  }).lean<ITelehealthSession>();
  if (!session) return null;

  const [recording, transcript, chatMessages] = await Promise.all([
    TelehealthRecordingModel.findOne({ sessionId, clinicId }).lean(),
    TelehealthTranscriptModel.findOne({ sessionId, clinicId }).sort({ createdAt: -1 }).lean(),
    TelehealthChatMessageModel.find({ sessionId, clinicId }).sort({ sentAt: 1 }).lean(),
  ]);

  return { session, recording, transcript, chatMessages };
}

export async function listArchivedSessions(
  clinicId: string,
  page: number,
  limit: number
): Promise<{ data: ITelehealthSession[]; meta: PaginationMeta }> {
  return paginate(TelehealthSessionModel, { clinicId, status: 'archived' }, page, limit, {
    'archiveRef.archivedAt': -1,
  });
}
