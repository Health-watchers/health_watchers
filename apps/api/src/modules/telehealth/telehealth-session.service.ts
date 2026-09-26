import crypto from 'crypto';
import { Types } from 'mongoose';
import logger from '@api/utils/logger';
import { auditLog } from '../audit/audit.service';
import { paginate, PaginationMeta } from '@api/utils/paginate';
import {
  TelehealthSessionModel,
  ITelehealthSession,
  BandwidthProfile,
  ParticipantRole,
  SessionStatus,
} from './models/telehealth-session.model';
import { getVideoProvider, mediaConstraintsFor, MediaConstraints } from './video-provider';
import { createMeetingLink } from './meeting-link.service';
import { recordTelehealthSessionEvent } from '@api/monitoring/custom-metrics';

export interface Actor {
  userId: string;
  clinicId: string;
}

export interface CreateSessionInput {
  appointmentId?: string;
  providerId: string;
  patientId: string;
  patientUserId?: string;
  scheduledStart: Date;
  bandwidthProfile?: BandwidthProfile;
  features?: Partial<ITelehealthSession['features']>;
  providerDisplayName?: string;
  patientDisplayName?: string;
}

export async function createSession(
  input: CreateSessionInput,
  actor: Actor
): Promise<ITelehealthSession> {
  const videoProvider = getVideoProvider();
  const roomName = `tele-${crypto.randomUUID()}`;
  const recordingEnabled = input.features?.recording ?? false;

  const room = await videoProvider.createRoom({
    roomName,
    recordingEnabled,
    maxParticipants: 8,
  });

  const participants: ITelehealthSession['participants'] = [
    {
      userId: new Types.ObjectId(input.providerId),
      role: 'provider',
      displayName: input.providerDisplayName || 'Provider',
    },
  ];
  if (input.patientUserId) {
    participants.push({
      userId: new Types.ObjectId(input.patientUserId),
      role: 'patient',
      displayName: input.patientDisplayName || 'Patient',
    });
  }

  const session = await TelehealthSessionModel.create({
    appointmentId: input.appointmentId,
    clinicId: actor.clinicId,
    providerId: input.providerId,
    patientId: input.patientId,
    videoProvider: videoProvider.name,
    roomName,
    roomSid: room.roomSid,
    status: 'scheduled',
    scheduledStart: input.scheduledStart,
    bandwidthProfile: input.bandwidthProfile ?? 'auto',
    features: {
      screenShare: input.features?.screenShare ?? true,
      chat: input.features?.chat ?? true,
      captions: input.features?.captions ?? false,
      recording: recordingEnabled,
    },
    participants,
    createdBy: actor.userId,
  });

  await auditLog({
    userId: actor.userId,
    clinicId: actor.clinicId,
    action: 'TELEHEALTH_SESSION_CREATE',
    resourceType: 'TelehealthSession',
    resourceId: String(session._id),
    outcome: 'SUCCESS',
    metadata: { provider: videoProvider.name, appointmentId: input.appointmentId },
  });

  recordTelehealthSessionEvent('created');
  return session.toObject();
}

async function loadSession(
  sessionId: string,
  clinicId: string
): Promise<import('mongoose').HydratedDocument<ITelehealthSession>> {
  const session = await TelehealthSessionModel.findOne({ _id: sessionId, clinicId });
  if (!session) throw new Error('Telehealth session not found');
  return session;
}

export async function startSession(sessionId: string, actor: Actor): Promise<ITelehealthSession> {
  const session = await loadSession(sessionId, actor.clinicId);
  if (
    session.status === 'ended' ||
    session.status === 'cancelled' ||
    session.status === 'archived'
  ) {
    throw new Error(`Cannot start a session that is ${session.status}`);
  }
  const wasScheduled = session.status !== 'active';
  session.status = 'active';
  session.actualStart = session.actualStart ?? new Date();
  await session.save();
  if (wasScheduled) recordTelehealthSessionEvent('started');
  return session.toObject();
}

export interface JoinResult {
  session: ITelehealthSession;
  accessToken: string;
  accessTokenExpiresAt: Date;
  meetingUrl: string;
  meetingLinkExpiresAt: Date;
  mediaConstraints: MediaConstraints;
  features: ITelehealthSession['features'];
}

export interface JoinSessionInput {
  sessionId: string;
  userId: string;
  identity: string;
  role: ParticipantRole;
  displayName: string;
  ttlSeconds?: number;
}

export async function joinSession(input: JoinSessionInput, actor: Actor): Promise<JoinResult> {
  const session = await loadSession(input.sessionId, actor.clinicId);
  if (!['scheduled', 'active'].includes(session.status)) {
    throw new Error(`Session is ${session.status} and cannot be joined`);
  }

  const videoProvider = getVideoProvider();
  const ttlSeconds = input.ttlSeconds ?? 2 * 60 * 60;
  const accessToken = await videoProvider.generateAccessToken({
    roomName: session.roomName,
    identity: input.identity,
    role: input.role,
    ttlSeconds,
  });
  const link = createMeetingLink({
    sessionId: String(session._id),
    identity: input.identity,
    role: input.role,
    ttlSeconds,
  });

  const existing = session.participants.find((p) => String(p.userId) === input.userId);
  if (existing) {
    existing.joinedAt = existing.joinedAt ?? new Date();
  } else {
    session.participants.push({
      userId: new Types.ObjectId(input.userId),
      role: input.role,
      displayName: input.displayName,
      joinedAt: new Date(),
    });
  }
  if (session.status === 'scheduled') {
    session.status = 'active';
    session.actualStart = session.actualStart ?? new Date();
  }
  await session.save();

  await auditLog({
    userId: actor.userId,
    clinicId: actor.clinicId,
    action: 'TELEHEALTH_SESSION_JOIN',
    resourceType: 'TelehealthSession',
    resourceId: String(session._id),
    outcome: 'SUCCESS',
    metadata: { role: input.role, identity: input.identity },
  });

  return {
    session: session.toObject(),
    accessToken: accessToken.token,
    accessTokenExpiresAt: accessToken.expiresAt,
    meetingUrl: link.url,
    meetingLinkExpiresAt: link.expiresAt,
    mediaConstraints: mediaConstraintsFor(session.bandwidthProfile),
    features: session.features,
  };
}

export async function endSession(sessionId: string, actor: Actor): Promise<ITelehealthSession> {
  const session = await loadSession(sessionId, actor.clinicId);
  if (session.status === 'ended' || session.status === 'archived') return session.toObject();

  try {
    if (session.roomSid) await getVideoProvider().endRoom(session.roomSid);
  } catch (err) {
    logger.warn({ err, sessionId }, '[telehealth] provider endRoom failed');
  }

  const now = new Date();
  session.status = 'ended';
  session.actualEnd = now;
  for (const participant of session.participants) {
    if (participant.joinedAt && !participant.leftAt) participant.leftAt = now;
  }
  await session.save();

  await auditLog({
    userId: actor.userId,
    clinicId: actor.clinicId,
    action: 'TELEHEALTH_SESSION_END',
    resourceType: 'TelehealthSession',
    resourceId: String(session._id),
    outcome: 'SUCCESS',
    metadata: {
      durationSeconds: session.actualStart
        ? Math.round((now.getTime() - session.actualStart.getTime()) / 1000)
        : null,
    },
  });

  recordTelehealthSessionEvent('ended');
  return session.toObject();
}

export async function cancelSession(
  sessionId: string,
  actor: Actor,
  reason?: string
): Promise<ITelehealthSession> {
  const session = await loadSession(sessionId, actor.clinicId);
  if (session.status === 'active' || session.status === 'ended' || session.status === 'archived') {
    throw new Error(`Cannot cancel a session that is ${session.status}`);
  }
  session.status = 'cancelled';
  await session.save();
  recordTelehealthSessionEvent('cancelled');
  logger.info({ sessionId, reason }, '[telehealth] session cancelled');
  return session.toObject();
}

export async function setCaptions(
  sessionId: string,
  enabled: boolean,
  actor: Actor
): Promise<ITelehealthSession> {
  const session = await loadSession(sessionId, actor.clinicId);
  session.features.captions = enabled;
  await session.save();
  return session.toObject();
}

export async function updateBandwidthProfile(
  sessionId: string,
  profile: BandwidthProfile,
  actor: Actor
): Promise<{ session: ITelehealthSession; mediaConstraints: MediaConstraints }> {
  const session = await loadSession(sessionId, actor.clinicId);
  session.bandwidthProfile = profile;
  await session.save();
  return { session: session.toObject(), mediaConstraints: mediaConstraintsFor(profile) };
}

export async function getSession(
  sessionId: string,
  clinicId: string
): Promise<ITelehealthSession | null> {
  return TelehealthSessionModel.findOne({ _id: sessionId, clinicId }).lean<ITelehealthSession>();
}

export interface ListSessionsQuery {
  status?: SessionStatus;
  providerId?: string;
  patientId?: string;
  page: number;
  limit: number;
}

export async function listSessions(
  clinicId: string,
  query: ListSessionsQuery
): Promise<{ data: ITelehealthSession[]; meta: PaginationMeta }> {
  const filter: Record<string, unknown> = { clinicId };
  if (query.status) filter.status = query.status;
  if (query.providerId) filter.providerId = query.providerId;
  if (query.patientId) filter.patientId = query.patientId;
  return paginate(TelehealthSessionModel, filter, query.page, query.limit, {
    scheduledStart: -1,
  });
}
