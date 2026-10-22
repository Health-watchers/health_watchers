import { Types } from 'mongoose';
import { auditLog } from '../audit/audit.service';
import {
  TelehealthRecordingModel,
  ITelehealthRecording,
  IRecordingAuditEntry,
} from './models/telehealth-recording.model';
import { TelehealthSessionModel } from './models/telehealth-session.model';
import { getVideoProvider } from './video-provider';
import { Actor } from './telehealth-session.service';
import { recordTelehealthRecordingConsent } from '@api/monitoring/custom-metrics';

function auditEntry(action: string, actorId?: string, detail?: string): IRecordingAuditEntry {
  return {
    at: new Date(),
    action,
    actorId: actorId ? new Types.ObjectId(actorId) : undefined,
    detail,
  };
}

/** Create (or return) the recording record for a session and open consent. */
export async function initRecording(
  sessionId: string,
  actor: Actor,
  requiredConsentRoles: Array<'provider' | 'patient'> = ['provider', 'patient']
): Promise<ITelehealthRecording> {
  const session = await TelehealthSessionModel.findOne({
    _id: sessionId,
    clinicId: actor.clinicId,
  });
  if (!session) throw new Error('Telehealth session not found');

  const existing = await TelehealthRecordingModel.findOne({ sessionId });
  if (existing) return existing.toObject();

  const recording = await TelehealthRecordingModel.create({
    sessionId,
    clinicId: actor.clinicId,
    status: 'consent_pending',
    requiredConsentRoles,
    auditTrail: [auditEntry('recording_initialised', actor.userId)],
  });
  return recording.toObject();
}

export interface ConsentInput {
  sessionId: string;
  userId: string;
  role: 'provider' | 'patient';
  consented: boolean;
}

function hasAllConsents(recording: ITelehealthRecording): boolean {
  return recording.requiredConsentRoles.every((role) =>
    recording.consents.some((c) => c.role === role && c.consented)
  );
}

/** Record one participant's consent decision; flips status to `consented` once all required parties agree. */
export async function recordConsent(
  input: ConsentInput,
  actor: Actor
): Promise<ITelehealthRecording> {
  const recording = await TelehealthRecordingModel.findOne({
    sessionId: input.sessionId,
    clinicId: actor.clinicId,
  });
  if (!recording) throw new Error('Recording not initialised for this session');
  if (recording.status === 'recording') {
    throw new Error('Cannot change consent while recording is in progress');
  }

  recording.consents = recording.consents.filter((c) => String(c.userId) !== input.userId);
  recording.consents.push({
    userId: new Types.ObjectId(input.userId),
    role: input.role,
    consented: input.consented,
    respondedAt: new Date(),
  });
  recording.auditTrail.push(
    auditEntry(
      input.consented ? 'consent_granted' : 'consent_denied',
      input.userId,
      `role=${input.role}`
    )
  );
  recording.status = hasAllConsents(recording) ? 'consented' : 'consent_pending';
  await recording.save();
  recordTelehealthRecordingConsent(input.consented);

  await auditLog({
    userId: actor.userId,
    clinicId: actor.clinicId,
    action: 'TELEHEALTH_RECORDING_CONSENT',
    resourceType: 'TelehealthRecording',
    resourceId: String(recording._id),
    outcome: 'SUCCESS',
    metadata: { role: input.role, consented: input.consented, status: recording.status },
  });

  return recording.toObject();
}

/** Start recording — refuses unless every required consent is present. */
export async function startRecording(
  sessionId: string,
  actor: Actor
): Promise<ITelehealthRecording> {
  const session = await TelehealthSessionModel.findOne({
    _id: sessionId,
    clinicId: actor.clinicId,
  });
  if (!session) throw new Error('Telehealth session not found');

  const recording = await TelehealthRecordingModel.findOne({ sessionId, clinicId: actor.clinicId });
  if (!recording) throw new Error('Recording not initialised for this session');
  if (!hasAllConsents(recording)) {
    throw new Error('Recording blocked: consent missing from one or more required participants');
  }
  if (recording.status === 'recording') return recording.toObject();

  const provider = getVideoProvider();
  const { recordingSid } = await provider.startRecording(session.roomSid || session.roomName);

  recording.status = 'recording';
  recording.startedAt = new Date();
  recording.storageKey = `telehealth/${session.clinicId}/${sessionId}/${recordingSid}.mp4`;
  recording.auditTrail.push(auditEntry('recording_started', actor.userId, recordingSid));
  await recording.save();

  session.features.recording = true;
  await session.save();

  await auditLog({
    userId: actor.userId,
    clinicId: actor.clinicId,
    action: 'TELEHEALTH_RECORDING_START',
    resourceType: 'TelehealthRecording',
    resourceId: String(recording._id),
    outcome: 'SUCCESS',
    metadata: { sessionId, storageKey: recording.storageKey },
  });

  return recording.toObject();
}

export async function stopRecording(
  sessionId: string,
  actor: Actor
): Promise<ITelehealthRecording> {
  const session = await TelehealthSessionModel.findOne({
    _id: sessionId,
    clinicId: actor.clinicId,
  });
  if (!session) throw new Error('Telehealth session not found');

  const recording = await TelehealthRecordingModel.findOne({ sessionId, clinicId: actor.clinicId });
  if (!recording) throw new Error('Recording not initialised for this session');
  if (recording.status !== 'recording') return recording.toObject();

  const provider = getVideoProvider();
  const { durationSeconds, sizeBytes } = await provider.stopRecording(
    session.roomSid || session.roomName
  );

  recording.status = 'stopped';
  recording.stoppedAt = new Date();
  recording.durationSeconds = durationSeconds;
  recording.sizeBytes = sizeBytes;
  recording.auditTrail.push(
    auditEntry('recording_stopped', actor.userId, `duration=${durationSeconds}s`)
  );
  await recording.save();

  await auditLog({
    userId: actor.userId,
    clinicId: actor.clinicId,
    action: 'TELEHEALTH_RECORDING_STOP',
    resourceType: 'TelehealthRecording',
    resourceId: String(recording._id),
    outcome: 'SUCCESS',
    metadata: { sessionId, durationSeconds, sizeBytes },
  });

  return recording.toObject();
}

export async function getRecording(
  sessionId: string,
  clinicId: string
): Promise<ITelehealthRecording | null> {
  return TelehealthRecordingModel.findOne({ sessionId, clinicId }).lean<ITelehealthRecording>();
}
