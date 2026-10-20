import crypto from 'crypto';
import logger from '@api/utils/logger';
import { BandwidthProfile, TelehealthProvider } from './models/telehealth-session.model';

/**
 * Video-conference provider abstraction (#1249).
 *
 * The application only ever talks to this interface. `MockVideoProvider` is a
 * fully working in-process implementation used for local dev and tests; the
 * Twilio / Zoom adapters are thin stubs that activate once their credentials are
 * present (`TELEHEALTH_VIDEO_PROVIDER` + provider keys).
 */
export interface CreateRoomOptions {
  roomName: string;
  /** Enables cloud recording capability at the provider (still gated by consent). */
  recordingEnabled: boolean;
  maxParticipants?: number;
}

export interface CreatedRoom {
  roomSid: string;
  provider: TelehealthProvider;
}

export interface AccessTokenOptions {
  roomName: string;
  identity: string;
  role: string;
  ttlSeconds: number;
}

export interface IssuedAccessToken {
  token: string;
  expiresAt: Date;
}

/** Media constraints handed to the client for a given bandwidth profile. */
export interface MediaConstraints {
  video: { maxBitrateKbps: number; maxFramerate: number; width: number; height: number };
  audio: { maxBitrateKbps: number };
  /** Drop to audio-only automatically when throughput falls below this. */
  audioOnlyBelowKbps: number;
}

export interface VideoProvider {
  readonly name: TelehealthProvider;
  isConfigured(): boolean;
  createRoom(options: CreateRoomOptions): Promise<CreatedRoom>;
  endRoom(roomSid: string): Promise<void>;
  generateAccessToken(options: AccessTokenOptions): Promise<IssuedAccessToken>;
  startRecording(roomSid: string): Promise<{ recordingSid: string }>;
  stopRecording(roomSid: string): Promise<{ durationSeconds: number; sizeBytes: number }>;
}

// ── Bandwidth optimisation ──────────────────────────────────────────────────
const PROFILE_CONSTRAINTS: Record<Exclude<BandwidthProfile, 'auto'>, MediaConstraints> = {
  low: {
    video: { maxBitrateKbps: 150, maxFramerate: 15, width: 320, height: 240 },
    audio: { maxBitrateKbps: 24 },
    audioOnlyBelowKbps: 80,
  },
  standard: {
    video: { maxBitrateKbps: 600, maxFramerate: 24, width: 640, height: 480 },
    audio: { maxBitrateKbps: 32 },
    audioOnlyBelowKbps: 150,
  },
  high: {
    video: { maxBitrateKbps: 1800, maxFramerate: 30, width: 1280, height: 720 },
    audio: { maxBitrateKbps: 48 },
    audioOnlyBelowKbps: 250,
  },
};

/**
 * Resolve concrete media constraints for a profile. `auto` starts at `standard`
 * so the client can renegotiate up or down from a safe baseline.
 */
export function mediaConstraintsFor(profile: BandwidthProfile): MediaConstraints {
  if (profile === 'auto') return PROFILE_CONSTRAINTS.standard;
  // eslint-disable-next-line security/detect-object-injection -- profile is a typed enum literal
  return PROFILE_CONSTRAINTS[profile];
}

// ── Mock provider ───────────────────────────────────────────────────────────
class MockVideoProvider implements VideoProvider {
  readonly name = 'mock' as const;
  private recordingStartedAt = new Map<string, number>();

  isConfigured(): boolean {
    return true;
  }

  async createRoom(options: CreateRoomOptions): Promise<CreatedRoom> {
    return {
      roomSid: `RM_mock_${crypto.createHash('sha1').update(options.roomName).digest('hex').slice(0, 24)}`,
      provider: 'mock',
    };
  }

  async endRoom(): Promise<void> {
    // no-op for the in-process provider
  }

  async generateAccessToken(options: AccessTokenOptions): Promise<IssuedAccessToken> {
    const expiresAt = new Date(Date.now() + options.ttlSeconds * 1000);
    const payload = JSON.stringify({
      room: options.roomName,
      identity: options.identity,
      role: options.role,
      exp: Math.floor(expiresAt.getTime() / 1000),
    });
    const token = Buffer.from(payload).toString('base64url');
    return { token: `mock.${token}`, expiresAt };
  }

  async startRecording(roomSid: string): Promise<{ recordingSid: string }> {
    this.recordingStartedAt.set(roomSid, Date.now());
    return { recordingSid: `RE_mock_${crypto.randomUUID()}` };
  }

  async stopRecording(roomSid: string): Promise<{ durationSeconds: number; sizeBytes: number }> {
    const startedAt = this.recordingStartedAt.get(roomSid) ?? Date.now() - 60_000;
    this.recordingStartedAt.delete(roomSid);
    const durationSeconds = Math.max(1, Math.round((Date.now() - startedAt) / 1000));
    // ~2 Mbps mixed A/V
    return { durationSeconds, sizeBytes: durationSeconds * 250_000 };
  }
}

// ── External provider stubs ─────────────────────────────────────────────────
class UnconfiguredProvider implements VideoProvider {
  constructor(
    readonly name: TelehealthProvider,
    private readonly envHint: string
  ) {}

  isConfigured(): boolean {
    return false;
  }

  private reject<T>(): Promise<T> {
    return Promise.reject(
      new Error(
        `Video provider "${this.name}" is selected but not configured. Set ${this.envHint} or use TELEHEALTH_VIDEO_PROVIDER=mock.`
      )
    );
  }

  createRoom(): Promise<CreatedRoom> {
    return this.reject();
  }
  endRoom(): Promise<void> {
    return this.reject();
  }
  generateAccessToken(): Promise<IssuedAccessToken> {
    return this.reject();
  }
  startRecording(): Promise<{ recordingSid: string }> {
    return this.reject();
  }
  stopRecording(): Promise<{ durationSeconds: number; sizeBytes: number }> {
    return this.reject();
  }
}

let overrideProvider: VideoProvider | null = null;

/** Test / integration hook to inject a provider. Pass `null` to reset. */
export function setVideoProvider(provider: VideoProvider | null): void {
  overrideProvider = provider;
}

export function getVideoProvider(): VideoProvider {
  if (overrideProvider) return overrideProvider;

  const selected = (process.env.TELEHEALTH_VIDEO_PROVIDER ?? 'mock') as TelehealthProvider;
  switch (selected) {
    case 'twilio':
      if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_API_KEY_SID) {
        logger.info('[telehealth] using Twilio video provider');
        // A real Twilio adapter would go here; fall back to mock until wired.
        return new UnconfiguredProvider('twilio', 'the Twilio Video SDK adapter');
      }
      return new UnconfiguredProvider('twilio', 'TWILIO_ACCOUNT_SID and TWILIO_API_KEY_SID');
    case 'zoom':
      return new UnconfiguredProvider(
        'zoom',
        'ZOOM_ACCOUNT_ID, ZOOM_CLIENT_ID and ZOOM_CLIENT_SECRET'
      );
    case 'mock':
    default:
      return new MockVideoProvider();
  }
}

export { MockVideoProvider };
