import logger from '@api/utils/logger';
import {
  TelehealthTranscriptModel,
  ITelehealthTranscript,
  ITranscriptSegment,
} from './models/telehealth-transcript.model';
import { TelehealthRecordingModel } from './models/telehealth-recording.model';
import { TelehealthSessionModel } from './models/telehealth-session.model';
import { Actor } from './telehealth-session.service';

/**
 * Speech-to-text transcription (#1249).
 *
 * The default `mock` engine produces a deterministic transcript so the feature
 * is end-to-end testable offline. A real engine (AWS Transcribe Medical, Deepgram,
 * Whisper) is plugged in by replacing `runEngine`.
 */
export type TranscriptionEngine = (input: {
  storageKey?: string;
  language: string;
}) => Promise<ITranscriptSegment[]>;

const mockEngine: TranscriptionEngine = async ({ language }) => [
  { speaker: 'provider', text: 'Hello, thanks for joining today.', startMs: 0, endMs: 3200 },
  { speaker: 'patient', text: 'Hi doctor, I can hear you clearly.', startMs: 3300, endMs: 6100 },
  {
    speaker: 'provider',
    text: `Let's review how you have been feeling since the last visit. (${language})`,
    startMs: 6200,
    endMs: 11000,
  },
];

let engine: TranscriptionEngine = mockEngine;

export function setTranscriptionEngine(next: TranscriptionEngine | null): void {
  engine = next ?? mockEngine;
}

export interface CreateTranscriptionInput {
  sessionId: string;
  recordingId?: string;
  language?: string;
}

/**
 * Queue and (synchronously, for the mock engine) run a transcription job.
 * Real async engines would return immediately with `status: 'processing'` and a
 * webhook would later mark it `completed`.
 */
export async function createTranscription(
  input: CreateTranscriptionInput,
  actor: Actor
): Promise<ITelehealthTranscript> {
  const session = await TelehealthSessionModel.findOne({
    _id: input.sessionId,
    clinicId: actor.clinicId,
  }).lean();
  if (!session) throw new Error('Telehealth session not found');

  const language = input.language || 'en';
  const recording = input.recordingId
    ? await TelehealthRecordingModel.findOne({
        _id: input.recordingId,
        clinicId: actor.clinicId,
      }).lean()
    : await TelehealthRecordingModel.findOne({
        sessionId: input.sessionId,
        clinicId: actor.clinicId,
      }).lean();

  const transcript = await TelehealthTranscriptModel.create({
    sessionId: input.sessionId,
    recordingId: recording?._id,
    clinicId: actor.clinicId,
    language,
    provider: engine === mockEngine ? 'mock' : 'external',
    status: 'processing',
  });

  try {
    const segments = await engine({ storageKey: recording?.storageKey, language });
    transcript.segments = segments;
    transcript.status = 'completed';
    transcript.completedAt = new Date();
    await transcript.save();

    if (recording) {
      await TelehealthRecordingModel.updateOne(
        { _id: recording._id },
        { $set: { transcriptId: transcript._id } }
      );
    }
  } catch (err) {
    transcript.status = 'failed';
    transcript.error = (err as Error).message;
    await transcript.save();
    logger.error({ err, sessionId: input.sessionId }, '[telehealth] transcription failed');
  }

  return transcript.toObject();
}

export async function getTranscript(
  sessionId: string,
  clinicId: string
): Promise<ITelehealthTranscript | null> {
  return TelehealthTranscriptModel.findOne({ sessionId, clinicId })
    .sort({ createdAt: -1 })
    .lean<ITelehealthTranscript>();
}
