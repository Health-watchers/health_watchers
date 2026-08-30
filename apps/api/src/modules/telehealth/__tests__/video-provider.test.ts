jest.mock('@api/utils/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import {
  MockVideoProvider,
  getVideoProvider,
  setVideoProvider,
  mediaConstraintsFor,
} from '../video-provider';

describe('mediaConstraintsFor', () => {
  it('returns tighter constraints for lower bandwidth profiles', () => {
    const low = mediaConstraintsFor('low');
    const high = mediaConstraintsFor('high');
    expect(low.video.maxBitrateKbps).toBeLessThan(high.video.maxBitrateKbps);
    expect(low.video.width).toBeLessThan(high.video.width);
  });

  it('maps "auto" to the standard baseline', () => {
    expect(mediaConstraintsFor('auto')).toEqual(mediaConstraintsFor('standard'));
  });
});

describe('MockVideoProvider', () => {
  const provider = new MockVideoProvider();

  it('derives a deterministic room sid from the room name', async () => {
    const a = await provider.createRoom({ roomName: 'tele-abc', recordingEnabled: false });
    const b = await provider.createRoom({ roomName: 'tele-abc', recordingEnabled: false });
    expect(a.roomSid).toBe(b.roomSid);
    expect(a.provider).toBe('mock');
  });

  it('issues an access token that expires in the requested window', async () => {
    const before = Date.now();
    const token = await provider.generateAccessToken({
      roomName: 'tele-abc',
      identity: 'u1',
      role: 'provider',
      ttlSeconds: 1800,
    });
    expect(token.token.startsWith('mock.')).toBe(true);
    expect(token.expiresAt.getTime()).toBeGreaterThanOrEqual(before + 1800 * 1000 - 50);
  });

  it('reports a plausible duration and size when recording stops', async () => {
    const { recordingSid } = await provider.startRecording('RM_x');
    expect(recordingSid).toMatch(/^RE_mock_/);
    const stopped = await provider.stopRecording('RM_x');
    expect(stopped.durationSeconds).toBeGreaterThanOrEqual(1);
    expect(stopped.sizeBytes).toBeGreaterThan(0);
  });
});

describe('getVideoProvider', () => {
  afterEach(() => {
    setVideoProvider(null);
    delete process.env.TELEHEALTH_VIDEO_PROVIDER;
  });

  it('defaults to the mock provider', () => {
    expect(getVideoProvider().name).toBe('mock');
  });

  it('honours an injected override', () => {
    const fake = new MockVideoProvider();
    setVideoProvider(fake);
    expect(getVideoProvider()).toBe(fake);
  });

  it('returns an unconfigured provider that throws for zoom without credentials', async () => {
    process.env.TELEHEALTH_VIDEO_PROVIDER = 'zoom';
    const provider = getVideoProvider();
    expect(provider.isConfigured()).toBe(false);
    await expect(provider.createRoom({ roomName: 'x', recordingEnabled: false })).rejects.toThrow(
      /not configured/i
    );
  });
});
