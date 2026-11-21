import { v4 as uuidv4 } from 'uuid';
import logger from '../../utils/logger';

export interface VideoRoomConfig {
  roomId: string;
  roomUrl: string;
  provider: 'daily.co' | 'jitsi' | 'twilio_video';
}

export interface VideoToken {
  token: string;
  roomId: string;
  provider: string;
}

export interface VideoSessionMetadata {
  appointmentId: string;
  roomId: string;
  startedAt: Date;
  endedAt?: Date;
  durationMinutes?: number;
  participants: string[];
}

const DAILY_API_BASE = 'https://api.daily.co/v1';

function getDailyApiKey(): string {
  const apiKey = process.env.DAILY_API_KEY;
  if (!apiKey) {
    throw new Error('DAILY_API_KEY is not configured');
  }
  return apiKey;
}

async function dailyRequest<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const response = await fetch(`${DAILY_API_BASE}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${getDailyApiKey()}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    logger.error('Daily.co API request failed', {
      path,
      status: response.status,
      error: errorText,
    });
    throw new Error(`Daily.co API request failed (${response.status}): ${errorText}`);
  }

  return (await response.json()) as T;
}

/**
 * Create a video room for telemedicine consultation
 */
export async function createVideoRoom(
  provider: 'daily.co' | 'jitsi' | 'twilio_video' = 'daily.co'
): Promise<VideoRoomConfig> {
  const roomId = `room-${uuidv4()}`;

  if (provider === 'daily.co') {
    // Create the room via the Daily.co REST API
    const room = await dailyRequest<{ id: string; url: string; name: string }>('/rooms', {
      name: roomId,
      properties: {
        enable_chat: true,
        enable_screenshare: true,
        start_video_off: false,
        start_audio_off: false,
        exp: Math.floor(Date.now() / 1000) + 60 * 60 * 4, // 4 hour expiry
      },
    });

    return {
      roomId: room.name ?? roomId,
      roomUrl: room.url,
      provider: 'daily.co',
    };
  } else if (provider === 'jitsi') {
    // For Jitsi, generate a room URL
    const roomUrl = `https://meet.jit.si/${roomId}`;
    return {
      roomId,
      roomUrl,
      provider: 'jitsi',
    };
  } else if (provider === 'twilio_video') {
    // For Twilio Video, we'd call Twilio API
    // This is a stub implementation
    const roomUrl = `twilio://video/${roomId}`;
    return {
      roomId,
      roomUrl,
      provider: 'twilio_video',
    };
  }

  throw new Error(`Unsupported video provider: ${provider}`);
}

/**
 * Generate video access token for a participant
 */
export async function generateVideoToken(
  roomId: string,
  participantName: string,
  provider: 'daily.co' | 'jitsi' | 'twilio_video' = 'daily.co'
): Promise<VideoToken> {
  if (provider === 'daily.co') {
    // Generate a meeting token via the Daily.co REST API
    const meetingToken = await dailyRequest<{ token: string }>('/meeting-tokens', {
      properties: {
        room_name: roomId,
        user_name: participantName,
        is_owner: false,
        exp: Math.floor(Date.now() / 1000) + 60 * 60 * 4, // 4 hour expiry
      },
    });

    return {
      token: meetingToken.token,
      roomId,
      provider: 'daily.co',
    };
  } else if (provider === 'jitsi') {
    // Jitsi doesn't require tokens for basic usage
    return {
      token: `jitsi-token-${uuidv4()}`,
      roomId,
      provider: 'jitsi',
    };
  } else if (provider === 'twilio_video') {
    // Twilio Video requires JWT tokens
    // In production, you'd generate a Twilio JWT token
    return {
      token: `twilio-token-${uuidv4()}`,
      roomId,
      provider: 'twilio_video',
    };
  }

  throw new Error(`Unsupported video provider: ${provider}`);
}

/**
 * Calculate video duration in minutes
 */
export function calculateVideoDuration(startedAt: Date, endedAt: Date): number {
  const durationMs = endedAt.getTime() - startedAt.getTime();
  return Math.round(durationMs / 60000); // Convert to minutes
}

// In-memory store of active video sessions keyed by appointment ID.
// In production this would be persisted alongside the appointment record.
const activeSessions = new Map<string, VideoSessionMetadata>();

/**
 * Record the start of a video session for an appointment (for billing).
 */
export async function startVideoSession(
  appointmentId: string,
  roomId: string,
  participants: string[] = []
): Promise<VideoSessionMetadata> {
  const metadata: VideoSessionMetadata = {
    appointmentId,
    roomId,
    startedAt: new Date(),
    participants: [...participants],
  };

  activeSessions.set(appointmentId, metadata);
  logger.info('Video session started', { appointmentId, roomId });

  return metadata;
}

/**
 * Record the end of a video session and compute its duration (for billing).
 */
export async function endVideoSession(
  appointmentId: string,
  participants?: string[]
): Promise<VideoSessionMetadata> {
  const existing = activeSessions.get(appointmentId);
  if (!existing) {
    throw new Error(`No active video session for appointment ${appointmentId}`);
  }

  const endedAt = new Date();
  const mergedParticipants = participants
    ? Array.from(new Set([...existing.participants, ...participants]))
    : existing.participants;

  const metadata: VideoSessionMetadata = {
    ...existing,
    endedAt,
    durationMinutes: calculateVideoDuration(existing.startedAt, endedAt),
    participants: mergedParticipants,
  };

  activeSessions.set(appointmentId, metadata);
  logger.info('Video session ended', {
    appointmentId,
    durationMinutes: metadata.durationMinutes,
    participants: metadata.participants,
  });

  return metadata;
}

/**
 * Retrieve recorded session metadata for an appointment.
 */
export async function getVideoSession(
  appointmentId: string
): Promise<VideoSessionMetadata | undefined> {
  return activeSessions.get(appointmentId);
}

/**
 * Waiting-room helper: returns a patient join token only once the doctor
 * has started the session. Throws otherwise so the patient stays waiting.
 */
export async function getWaitingRoomJoinToken(
  appointmentId: string,
  patientName: string,
  provider: 'daily.co' | 'jitsi' | 'twilio_video' = 'daily.co'
): Promise<VideoToken> {
  const session = activeSessions.get(appointmentId);
  if (!session) {
    throw new Error('The doctor has not started the session yet');
  }

  if (!session.participants.includes(patientName)) {
    session.participants.push(patientName);
  }

  return generateVideoToken(session.roomId, patientName, provider);
}
