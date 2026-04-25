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

/**
 * Create a video room for telemedicine consultation
 */
export async function createVideoRoom(provider: 'daily.co' | 'jitsi' | 'twilio_video' = 'daily.co'): Promise<VideoRoomConfig> {
  const roomId = `room-${uuidv4()}`;

  if (provider === 'daily.co') {
    // For Daily.co, we generate a room URL directly
    // In production, you'd call Daily.co API to create a room
    const roomUrl = `https://health-watchers.daily.co/${roomId}`;
    return {
      roomId,
      roomUrl,
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
    // Daily.co uses room URLs directly, no token needed
    // In production, you'd generate a Daily.co token
    return {
      token: `daily-token-${uuidv4()}`,
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
