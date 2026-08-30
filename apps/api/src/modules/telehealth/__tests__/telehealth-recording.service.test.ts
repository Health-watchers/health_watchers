jest.mock('@api/utils/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import * as recordingService from '../telehealth-recording.service';
import { TelehealthRecordingModel } from '../models/telehealth-recording.model';
import { TelehealthSessionModel } from '../models/telehealth-session.model';
import { getVideoProvider } from '../video-provider';

jest.mock('../models/telehealth-recording.model', () => ({
  TelehealthRecordingModel: { create: jest.fn(), findOne: jest.fn() },
}));
jest.mock('../models/telehealth-session.model', () => ({
  TelehealthSessionModel: { findOne: jest.fn() },
}));
jest.mock('../video-provider', () => ({ getVideoProvider: jest.fn() }));
jest.mock('../../audit/audit.service', () => ({
  auditLog: jest.fn().mockResolvedValue(undefined),
}));

const recFindOne = TelehealthRecordingModel.findOne as jest.Mock;
const sessFindOne = TelehealthSessionModel.findOne as jest.Mock;
const mockGetProvider = getVideoProvider as jest.Mock;

const actor = { userId: '507f1f77bcf86cd799439aaa', clinicId: '507f1f77bcf86cd799439bbb' };
let oidSeq = 0;
const oid = (): string => (++oidSeq).toString(16).padStart(24, '0');

function fakeRecording(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const doc: Record<string, unknown> = {
    _id: 'rec-1',
    sessionId: 'sess-1',
    status: 'consent_pending',
    requiredConsentRoles: ['provider', 'patient'],
    consents: [] as Array<Record<string, unknown>>,
    auditTrail: [] as Array<Record<string, unknown>>,
    save: jest.fn().mockResolvedValue(undefined),
    toObject() {
      return { ...this };
    },
    ...overrides,
  };
  return doc;
}

function fakeSession(): Record<string, unknown> {
  return {
    _id: 'sess-1',
    roomSid: 'RM_1',
    roomName: 'tele-1',
    clinicId: actor.clinicId,
    features: { recording: false },
    save: jest.fn().mockResolvedValue(undefined),
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGetProvider.mockReturnValue({
    startRecording: jest.fn().mockResolvedValue({ recordingSid: 'RE_1' }),
    stopRecording: jest.fn().mockResolvedValue({ durationSeconds: 120, sizeBytes: 30_000_000 }),
  });
});

describe('recordConsent', () => {
  it('stays consent_pending until every required party agrees, then flips to consented', async () => {
    const doc = fakeRecording();
    recFindOne.mockResolvedValue(doc);

    await recordingService.recordConsent(
      { sessionId: 'sess-1', userId: oid(), role: 'provider', consented: true },
      actor
    );
    expect(doc.status).toBe('consent_pending');

    await recordingService.recordConsent(
      { sessionId: 'sess-1', userId: oid(), role: 'patient', consented: true },
      actor
    );
    expect(doc.status).toBe('consented');
    expect((doc.consents as unknown[]).length).toBe(2);
    expect((doc.auditTrail as unknown[]).length).toBe(2);
  });
});

describe('startRecording', () => {
  it('is blocked when consent is missing from a required participant', async () => {
    sessFindOne.mockResolvedValue(fakeSession());
    recFindOne.mockResolvedValue(
      fakeRecording({
        consents: [
          { userId: 'prov-1', role: 'provider', consented: true, respondedAt: new Date() },
        ],
      })
    );

    await expect(recordingService.startRecording('sess-1', actor)).rejects.toThrow(
      /consent missing/i
    );
  });

  it('starts once all consents are present and appends to the audit trail', async () => {
    const session = fakeSession();
    sessFindOne.mockResolvedValue(session);
    const doc = fakeRecording({
      status: 'consented',
      consents: [
        { userId: 'prov-1', role: 'provider', consented: true, respondedAt: new Date() },
        { userId: 'pat-1', role: 'patient', consented: true, respondedAt: new Date() },
      ],
    });
    recFindOne.mockResolvedValue(doc);

    const result = await recordingService.startRecording('sess-1', actor);

    expect(result.status).toBe('recording');
    expect(result.storageKey).toContain('sess-1');
    expect(
      (doc.auditTrail as unknown[]).some(
        (e) => (e as { action: string }).action === 'recording_started'
      )
    ).toBe(true);
    expect(session.features.recording).toBe(true);
    expect(mockGetProvider().startRecording).toHaveBeenCalled();
  });
});

describe('stopRecording', () => {
  it('records duration and size from the provider', async () => {
    sessFindOne.mockResolvedValue(fakeSession());
    recFindOne.mockResolvedValue(fakeRecording({ status: 'recording', startedAt: new Date() }));

    const result = await recordingService.stopRecording('sess-1', actor);

    expect(result.status).toBe('stopped');
    expect(result.durationSeconds).toBe(120);
    expect(result.sizeBytes).toBe(30_000_000);
  });
});
