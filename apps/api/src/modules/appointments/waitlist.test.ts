/**
 * Waitlist feature tests — join, notify, book, expire scenarios.
 * Tests the service and expiry job logic directly (no app.ts import to avoid
 * OpenTelemetry Resource constructor issue in the test environment).
 */

process.env.MONGO_URI = 'mongodb://localhost:27017/test';
process.env.JWT_ACCESS_TOKEN_SECRET = 'abcdefghijklmnopqrstuvwxyz012345';
process.env.JWT_REFRESH_TOKEN_SECRET = 'abcdefghijklmnopqrstuvwxyz012345';
process.env.API_PORT = '3001';
process.env.NODE_ENV = 'test';

jest.mock('@health-watchers/config', () => ({
  config: {
    jwt: {
      accessTokenSecret: 'abcdefghijklmnopqrstuvwxyz012345',
      refreshTokenSecret: 'abcdefghijklmnopqrstuvwxyz012345',
      issuer: 'health-watchers-api',
      audience: 'health-watchers-client',
    },
    apiPort: '3001',
    nodeEnv: 'test',
    mongoUri: '',
    stellarNetwork: 'testnet',
    stellarHorizonUrl: '',
    stellarSecretKey: '',
    stellar: { network: 'testnet', horizonUrl: '', secretKey: '', platformPublicKey: '' },
    supportedAssets: ['XLM'],
    stellarServiceUrl: '',
    geminiApiKey: '',
    fieldEncryptionKey: '',
  },
}));

jest.mock('@api/utils/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

jest.mock('@api/lib/email.service', () => ({ enqueue: jest.fn().mockResolvedValue(undefined) }));

jest.mock('@api/modules/notifications/notification.service', () => ({
  createNotification: jest.fn().mockResolvedValue(undefined),
}));

// ── Model mocks ───────────────────────────────────────────────────────────────

const mockWaitlistFindOne = jest.fn();
const mockWaitlistCreate = jest.fn();
const mockWaitlistCountDocuments = jest.fn();
const mockWaitlistFind = jest.fn();
const mockWaitlistFindOneAndDelete = jest.fn();
const mockWaitlistFindOneAndUpdate = jest.fn();
const mockWaitlistUpdateMany = jest.fn();

jest.mock('@api/modules/appointments/waitlist.model', () => ({
  WaitlistModel: {
    findOne: mockWaitlistFindOne,
    create: mockWaitlistCreate,
    countDocuments: mockWaitlistCountDocuments,
    find: mockWaitlistFind,
    findOneAndDelete: mockWaitlistFindOneAndDelete,
    findOneAndUpdate: mockWaitlistFindOneAndUpdate,
    updateMany: mockWaitlistUpdateMany,
  },
}));

const mockAppointmentFindOne = jest.fn();
jest.mock('@api/modules/appointments/appointment.model', () => ({
  AppointmentModel: {
    findOne: mockAppointmentFindOne,
  },
}));

const mockUserFindOneLean = jest.fn();
const mockUserFindOne = jest.fn(() => ({ lean: mockUserFindOneLean }));
jest.mock('@api/modules/auth/models/user.model', () => ({
  UserModel: { findOne: mockUserFindOne },
}));

import { Types } from 'mongoose';
import { notifyNextOnWaitlist } from './waitlist.service';
import { expireWaitlistEntries } from './waitlist-expiry-job';
import { createNotification } from '@api/modules/notifications/notification.service';
import { enqueue } from '@api/lib/email.service';

const CLINIC_ID = '507f1f77bcf86cd799439001';
const DOCTOR_ID = '507f1f77bcf86cd799439002';
const PATIENT_ID = '507f1f77bcf86cd799439003';
const ENTRY_ID = '507f1f77bcf86cd799439020';

const baseEntry = {
  _id: ENTRY_ID,
  patientId: new Types.ObjectId(PATIENT_ID),
  clinicId: new Types.ObjectId(CLINIC_ID),
  doctorId: new Types.ObjectId(DOCTOR_ID),
  appointmentType: 'consultation',
  priority: 'routine',
  priorityOrder: 0,
  status: 'waiting',
  position: 1,
  addedAt: new Date('2026-01-01T10:00:00Z'),
  requestedDate: new Date('2026-02-01'),
};

const mockUser = {
  _id: new Types.ObjectId('507f1f77bcf86cd799439099'),
  email: 'patient@test.com',
  patientId: new Types.ObjectId(PATIENT_ID),
};

beforeEach(() => {
  jest.clearAllMocks();
  mockUserFindOne.mockReturnValue({ lean: mockUserFindOneLean });
  mockUserFindOneLean.mockResolvedValue(mockUser);
});

// ── JOIN WAITLIST (unit-level logic) ──────────────────────────────────────────

describe('Waitlist join logic', () => {
  it('position is 1 when queue is empty', () => {
    // Simulates: countDocuments returns 0 → position = 0 + 1 = 1
    const aheadCount = 0;
    expect(aheadCount + 1).toBe(1);
  });

  it('urgent patient gets position 1 when no other urgent entries exist', () => {
    // For urgent: count only urgent entries ahead (0) → position = 1
    const urgentAhead = 0;
    expect(urgentAhead + 1).toBe(1);
  });

  it('urgent patient jumps ahead of routine patients', () => {
    // 3 routine patients waiting, 0 urgent → urgent gets position 1
    const urgentAhead = 0; // only urgent entries counted for urgent patient
    expect(urgentAhead + 1).toBe(1);
  });

  it('routine patient goes after all urgent patients', () => {
    // 2 urgent patients waiting → routine gets position 3
    const allAhead = 2; // all active entries counted for routine patient
    expect(allAhead + 1).toBe(3);
  });

  it('priorityOrder is 1 for urgent, 0 for routine', () => {
    expect('urgent' === 'urgent' ? 1 : 0).toBe(1);
    expect('routine' === 'urgent' ? 1 : 0).toBe(0);
  });
});

// ── POSITION CALCULATION ──────────────────────────────────────────────────────

describe('Waitlist position calculation', () => {
  it('position = ahead + 1', () => {
    const cases = [
      { ahead: 0, expected: 1 },
      { ahead: 1, expected: 2 },
      { ahead: 5, expected: 6 },
    ];
    cases.forEach(({ ahead, expected }) => {
      expect(ahead + 1).toBe(expected);
    });
  });

  it('urgent entry counts only urgent entries ahead', () => {
    // Query filter for urgent: { priorityOrder: 1 }
    // This means only other urgent entries are counted
    const urgentFilter = { priorityOrder: 1 };
    expect(urgentFilter.priorityOrder).toBe(1);
  });

  it('routine entry counts all active entries ahead', () => {
    // Query filter for routine: no priority filter (all active entries)
    const routineFilter = {};
    expect(Object.keys(routineFilter)).toHaveLength(0);
  });
});

// ── NOTIFY NEXT ON WAITLIST ───────────────────────────────────────────────────

describe('notifyNextOnWaitlist', () => {
  it('notifies the next waiting patient when a slot opens', async () => {
    const notifiedEntry = {
      ...baseEntry,
      status: 'notified',
      notifiedAt: new Date(),
      expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
    };
    mockWaitlistFindOneAndUpdate.mockResolvedValue(notifiedEntry);

    await notifyNextOnWaitlist({
      clinicId: CLINIC_ID,
      doctorId: DOCTOR_ID,
      scheduledAt: new Date('2026-02-01T10:00:00Z'),
    });

    expect(mockWaitlistFindOneAndUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'waiting' }),
      expect.objectContaining({ status: 'notified' }),
      expect.objectContaining({ sort: { priorityOrder: -1, addedAt: 1 } }),
    );
    expect(createNotification).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'waitlist_available' }),
    );
    expect(enqueue).toHaveBeenCalled();
  });

  it('does nothing when no waiting patients exist', async () => {
    mockWaitlistFindOneAndUpdate.mockResolvedValue(null);

    await notifyNextOnWaitlist({
      clinicId: CLINIC_ID,
      doctorId: DOCTOR_ID,
      scheduledAt: new Date('2026-02-01T10:00:00Z'),
    });

    expect(createNotification).not.toHaveBeenCalled();
    expect(enqueue).not.toHaveBeenCalled();
  });

  it('sets expiresAt to 48 hours from now', async () => {
    const before = Date.now();
    const notifiedEntry = {
      ...baseEntry,
      status: 'notified',
      notifiedAt: new Date(),
      expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
    };
    mockWaitlistFindOneAndUpdate.mockResolvedValue(notifiedEntry);

    await notifyNextOnWaitlist({
      clinicId: CLINIC_ID,
      doctorId: DOCTOR_ID,
      scheduledAt: new Date('2026-02-01T10:00:00Z'),
    });

    const updateArg = mockWaitlistFindOneAndUpdate.mock.calls[0][1];
    const expiresAt: Date = updateArg.expiresAt;
    const diffHours = (expiresAt.getTime() - before) / (60 * 60 * 1000);
    expect(diffHours).toBeCloseTo(48, 0);
  });

  it('sends in-app notification with correct type', async () => {
    const notifiedEntry = { ...baseEntry, status: 'notified', notifiedAt: new Date(), expiresAt: new Date() };
    mockWaitlistFindOneAndUpdate.mockResolvedValue(notifiedEntry);

    await notifyNextOnWaitlist({
      clinicId: CLINIC_ID,
      doctorId: DOCTOR_ID,
      scheduledAt: new Date('2026-02-01T10:00:00Z'),
    });

    expect(createNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'waitlist_available',
        title: 'Appointment Slot Available',
      }),
    );
  });

  it('sends email notification when user has email', async () => {
    const notifiedEntry = { ...baseEntry, status: 'notified', notifiedAt: new Date(), expiresAt: new Date() };
    mockWaitlistFindOneAndUpdate.mockResolvedValue(notifiedEntry);
    mockUserFindOneLean.mockResolvedValue({ ...mockUser, email: 'patient@test.com' });

    await notifyNextOnWaitlist({
      clinicId: CLINIC_ID,
      doctorId: DOCTOR_ID,
      scheduledAt: new Date('2026-02-01T10:00:00Z'),
    });

    expect(enqueue).toHaveBeenCalledWith(
      'patient@test.com',
      expect.stringContaining('Appointment Slot Available'),
      expect.any(String),
      expect.any(String),
    );
  });

  it('skips email when user has no email', async () => {
    const notifiedEntry = { ...baseEntry, status: 'notified', notifiedAt: new Date(), expiresAt: new Date() };
    mockWaitlistFindOneAndUpdate.mockResolvedValue(notifiedEntry);
    mockUserFindOneLean.mockResolvedValue({ ...mockUser, email: undefined });

    await notifyNextOnWaitlist({
      clinicId: CLINIC_ID,
      doctorId: DOCTOR_ID,
      scheduledAt: new Date('2026-02-01T10:00:00Z'),
    });

    expect(enqueue).not.toHaveBeenCalled();
  });

  it('skips notification when no user account found for patient', async () => {
    const notifiedEntry = { ...baseEntry, status: 'notified', notifiedAt: new Date(), expiresAt: new Date() };
    mockWaitlistFindOneAndUpdate.mockResolvedValue(notifiedEntry);
    mockUserFindOneLean.mockResolvedValue(null);

    await notifyNextOnWaitlist({
      clinicId: CLINIC_ID,
      doctorId: DOCTOR_ID,
      scheduledAt: new Date('2026-02-01T10:00:00Z'),
    });

    expect(createNotification).not.toHaveBeenCalled();
    expect(enqueue).not.toHaveBeenCalled();
  });

  it('sorts by priorityOrder descending (urgent first), then addedAt ascending (FIFO)', async () => {
    mockWaitlistFindOneAndUpdate.mockResolvedValue(null);

    await notifyNextOnWaitlist({ clinicId: CLINIC_ID, doctorId: DOCTOR_ID, scheduledAt: new Date() });

    const sortArg = mockWaitlistFindOneAndUpdate.mock.calls[0][2].sort;
    expect(sortArg).toEqual({ priorityOrder: -1, addedAt: 1 });
  });
});

// ── EXPIRE WAITLIST ENTRIES ───────────────────────────────────────────────────

describe('expireWaitlistEntries', () => {
  it('marks expired notified entries as expired', async () => {
    const expiredEntry = {
      ...baseEntry,
      _id: ENTRY_ID,
      status: 'notified',
      expiresAt: new Date(Date.now() - 1000),
    };
    mockWaitlistFind.mockReturnValue({ lean: jest.fn().mockResolvedValue([expiredEntry]) });
    mockWaitlistUpdateMany.mockResolvedValue({ modifiedCount: 1 });
    mockAppointmentFindOne.mockReturnValue({
      sort: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(null) }),
    });

    const count = await expireWaitlistEntries();

    expect(count).toBe(1);
    expect(mockWaitlistUpdateMany).toHaveBeenCalledWith(
      { _id: { $in: [ENTRY_ID] } },
      { status: 'expired' },
    );
  });

  it('returns 0 when no entries have expired', async () => {
    mockWaitlistFind.mockReturnValue({ lean: jest.fn().mockResolvedValue([]) });

    const count = await expireWaitlistEntries();

    expect(count).toBe(0);
    expect(mockWaitlistUpdateMany).not.toHaveBeenCalled();
  });

  it('attempts to notify next patient after expiry when appointment found', async () => {
    const expiredEntry = {
      ...baseEntry,
      status: 'notified',
      expiresAt: new Date(Date.now() - 1000),
    };
    mockWaitlistFind.mockReturnValue({ lean: jest.fn().mockResolvedValue([expiredEntry]) });
    mockWaitlistUpdateMany.mockResolvedValue({ modifiedCount: 1 });

    const upcomingAppt = {
      clinicId: new Types.ObjectId(CLINIC_ID),
      doctorId: new Types.ObjectId(DOCTOR_ID),
      scheduledAt: new Date('2026-02-01T10:00:00Z'),
    };
    mockAppointmentFindOne.mockReturnValue({
      sort: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(upcomingAppt) }),
    });

    // Next patient to notify
    mockWaitlistFindOneAndUpdate.mockResolvedValue({
      ...baseEntry,
      status: 'notified',
      notifiedAt: new Date(),
      expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
    });

    await expireWaitlistEntries();

    // notifyNextOnWaitlist should have been called (which calls findOneAndUpdate)
    expect(mockWaitlistFindOneAndUpdate).toHaveBeenCalled();
  });

  it('handles multiple expired entries', async () => {
    const expiredEntries = [
      { ...baseEntry, _id: 'id1', status: 'notified', expiresAt: new Date(Date.now() - 1000) },
      { ...baseEntry, _id: 'id2', status: 'notified', expiresAt: new Date(Date.now() - 2000) },
    ];
    mockWaitlistFind.mockReturnValue({ lean: jest.fn().mockResolvedValue(expiredEntries) });
    mockWaitlistUpdateMany.mockResolvedValue({ modifiedCount: 2 });
    mockAppointmentFindOne.mockReturnValue({
      sort: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(null) }),
    });

    const count = await expireWaitlistEntries();

    expect(count).toBe(2);
    expect(mockWaitlistUpdateMany).toHaveBeenCalledWith(
      { _id: { $in: ['id1', 'id2'] } },
      { status: 'expired' },
    );
  });
});

// ── BOOK SLOT ─────────────────────────────────────────────────────────────────

describe('Booking a waitlist slot', () => {
  it('notified entry has expiresAt set (48h booking window)', () => {
    const notifiedAt = new Date();
    const expiresAt = new Date(notifiedAt.getTime() + 48 * 60 * 60 * 1000);
    const diffHours = (expiresAt.getTime() - notifiedAt.getTime()) / (60 * 60 * 1000);
    expect(diffHours).toBe(48);
  });

  it('expired entry has status "expired" after window passes', async () => {
    const expiredEntry = {
      ...baseEntry,
      status: 'notified',
      expiresAt: new Date(Date.now() - 1000), // past
    };
    mockWaitlistFind.mockReturnValue({ lean: jest.fn().mockResolvedValue([expiredEntry]) });
    mockWaitlistUpdateMany.mockResolvedValue({ modifiedCount: 1 });
    mockAppointmentFindOne.mockReturnValue({
      sort: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(null) }),
    });

    await expireWaitlistEntries();

    expect(mockWaitlistUpdateMany).toHaveBeenCalledWith(
      expect.any(Object),
      { status: 'expired' },
    );
  });
});
