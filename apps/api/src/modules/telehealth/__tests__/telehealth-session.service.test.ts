jest.mock('@api/utils/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import * as sessionService from '../telehealth-session.service';
import { TelehealthSessionModel } from '../models/telehealth-session.model';
import { getVideoProvider } from '../video-provider';
import { createMeetingLink } from '../meeting-link.service';

jest.mock('../models/telehealth-session.model', () => ({
  TelehealthSessionModel: { create: jest.fn(), findOne: jest.fn() },
}));
jest.mock('../video-provider', () => ({
  getVideoProvider: jest.fn(),
  mediaConstraintsFor: jest.fn(() => ({
    video: { maxBitrateKbps: 600, maxFramerate: 24, width: 640, height: 480 },
    audio: { maxBitrateKbps: 32 },
    audioOnlyBelowKbps: 150,
  })),
}));
jest.mock('../meeting-link.service', () => ({
  createMeetingLink: jest.fn(() => ({
    token: 'tkn',
    url: 'https://app/telehealth/join?token=tkn',
    expiresAt: new Date(Date.now() + 3_600_000),
    jti: 'jti-1',
  })),
}));
jest.mock('../../audit/audit.service', () => ({
  auditLog: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('@api/utils/paginate', () => ({ paginate: jest.fn() }));

const createModel = TelehealthSessionModel.create as jest.Mock;
const findOneModel = TelehealthSessionModel.findOne as jest.Mock;
const mockGetProvider = getVideoProvider as jest.Mock;

const actor = { userId: '507f1f77bcf86cd799439aaa', clinicId: '507f1f77bcf86cd799439bbb' };
let oidSeq = 0;
const oid = (): string => (++oidSeq).toString(16).padStart(24, '0');

function providerStub(): Record<string, unknown> {
  return {
    name: 'mock',
    createRoom: jest.fn().mockResolvedValue({ roomSid: 'RM_1', provider: 'mock' }),
    endRoom: jest.fn().mockResolvedValue(undefined),
    generateAccessToken: jest
      .fn()
      .mockResolvedValue({ token: 'access-tkn', expiresAt: new Date(Date.now() + 7_200_000) }),
    startRecording: jest.fn(),
    stopRecording: jest.fn(),
  };
}

interface FakeSession {
  _id: string;
  status: string;
  roomName: string;
  roomSid?: string;
  bandwidthProfile: string;
  features: Record<string, boolean>;
  participants: Array<Record<string, unknown>>;
  actualStart?: Date;
  actualEnd?: Date;
  save: jest.Mock;
  toObject: () => unknown;
}

function fakeSession(overrides: Partial<FakeSession> = {}): FakeSession {
  const doc: FakeSession = {
    _id: 'sess-1',
    status: 'scheduled',
    roomName: 'tele-1',
    roomSid: 'RM_1',
    bandwidthProfile: 'auto',
    features: { screenShare: true, chat: true, captions: false, recording: false },
    participants: [],
    save: jest.fn().mockResolvedValue(undefined),
    toObject() {
      return { ...this };
    },
    ...overrides,
  };
  return doc;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGetProvider.mockReturnValue(providerStub());
});

describe('createSession', () => {
  it('provisions a room and persists a scheduled session', async () => {
    createModel.mockImplementation(
      (doc: Record<string, unknown>): Record<string, unknown> => ({
        ...doc,
        _id: 'sess-1',
        toObject: (): Record<string, unknown> => ({ ...doc, _id: 'sess-1' }),
      })
    );

    const session = (await sessionService.createSession(
      {
        providerId: '507f1f77bcf86cd799439ccc',
        patientId: '507f1f77bcf86cd799439ddd',
        patientUserId: '507f1f77bcf86cd799439eee',
        scheduledStart: new Date('2026-09-01T10:00:00Z'),
        features: { recording: true },
      },
      actor
    )) as Record<string, unknown>;

    expect(session.roomSid).toBe('RM_1');
    expect(session.status).toBe('scheduled');
    expect(session.videoProvider).toBe('mock');
    expect((session.participants as unknown[]).length).toBe(2);
  });
});

describe('joinSession', () => {
  it('returns an access token, secure link and media constraints and activates the session', async () => {
    const doc = fakeSession({ status: 'scheduled' });
    findOneModel.mockResolvedValue(doc);

    const result = await sessionService.joinSession(
      {
        sessionId: 'sess-1',
        userId: oid(),
        identity: 'u-42',
        role: 'provider',
        displayName: 'Dr Ada',
      },
      actor
    );

    expect(result.accessToken).toBe('access-tkn');
    expect(result.meetingUrl).toContain('token=tkn');
    expect(result.mediaConstraints.video.width).toBe(640);
    expect(doc.status).toBe('active');
    expect(doc.participants).toHaveLength(1);
    expect(createMeetingLink).toHaveBeenCalledTimes(1);
  });

  it('refuses to join an ended session', async () => {
    findOneModel.mockResolvedValue(fakeSession({ status: 'ended' }));
    await expect(
      sessionService.joinSession(
        { sessionId: 'sess-1', userId: oid(), identity: 'u1', role: 'patient', displayName: 'P' },
        actor
      )
    ).rejects.toThrow(/ended/);
  });
});

describe('endSession', () => {
  it('marks the session ended, stamps actualEnd and closes out participants', async () => {
    const joinedAt = new Date(Date.now() - 600_000);
    const doc = fakeSession({
      status: 'active',
      actualStart: joinedAt,
      participants: [{ userId: 'u1', role: 'provider', displayName: 'D', joinedAt }],
    });
    findOneModel.mockResolvedValue(doc);

    await sessionService.endSession('sess-1', actor);

    expect(doc.status).toBe('ended');
    expect(doc.actualEnd).toBeInstanceOf(Date);
    expect(doc.participants[0].leftAt).toBeInstanceOf(Date);
  });
});

describe('setCaptions', () => {
  it('toggles the captions accessibility feature', async () => {
    const doc = fakeSession();
    findOneModel.mockResolvedValue(doc);
    await sessionService.setCaptions('sess-1', true, actor);
    expect(doc.features.captions).toBe(true);
    expect(doc.save).toHaveBeenCalled();
  });
});
