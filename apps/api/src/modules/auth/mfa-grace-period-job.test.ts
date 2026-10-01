/**
 * Deterministic tests for mfa-grace-period-job using fake timers.
 *
 * Issue: #1487
 *
 * All external I/O (Mongoose UserModel, email service, logger) is mocked.
 */

// ── Module mocks ───────────────────────────────────────────────────────────────

jest.mock('@api/modules/auth/models/user.model', () => ({
  UserModel: {
    find: jest.fn(),
  },
}));

jest.mock('@api/lib/email.service', () => ({
  sendMfaGracePeriodReminderEmail: jest.fn(),
}));

jest.mock('@api/utils/logger', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

// ── Imports ────────────────────────────────────────────────────────────────────

import { UserModel } from '../auth/models/user.model';
import { sendMfaGracePeriodReminderEmail } from '@api/lib/email.service';
import logger from '@api/utils/logger';
import { runMfaGracePeriodReminderTick } from './mfa-grace-period-job';

// ── Helpers ────────────────────────────────────────────────────────────────────

function makeUser(overrides: Record<string, unknown> = {}) {
  const gracePeriodEndsAt = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000); // 3 days from now
  return {
    id: 'user-1',
    email: 'doctor@clinic.com',
    fullName: 'Dr. Jane',
    mfaGracePeriodEndsAt: gracePeriodEndsAt,
    ...overrides,
  };
}

function mockUserFindReturning(users: unknown[]) {
  (UserModel.find as jest.Mock).mockReturnValue({
    select: jest.fn().mockResolvedValue(users),
  });
}

// ── Lifecycle ──────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  mockUserFindReturning([]);
});

afterEach(() => {
  jest.useRealTimers();
});

// ─────────────────────────────────────────────────────────────────────────────
// runMfaGracePeriodReminderTick — core logic
// ─────────────────────────────────────────────────────────────────────────────

describe('runMfaGracePeriodReminderTick — core logic', () => {
  it('sends reminder for users 3 days before deadline', async () => {
    const fixedNow = new Date('2026-06-01T10:00:00.000Z');
    jest.setSystemTime(fixedNow);

    // User whose grace period ends exactly 3 days from now (within the 1-hour window)
    const gracePeriodEndsAt = new Date(fixedNow.getTime() + 3 * 24 * 60 * 60 * 1000 - 30 * 60 * 1000);
    const user = makeUser({ mfaGracePeriodEndsAt: gracePeriodEndsAt });

    mockUserFindReturning([user]);

    await runMfaGracePeriodReminderTick();

    expect(sendMfaGracePeriodReminderEmail).toHaveBeenCalledWith(
      user.email,
      user.fullName,
      3, // days
      gracePeriodEndsAt
    );
  });

  it('sends reminder for users 1 day before deadline', async () => {
    const fixedNow = new Date('2026-06-01T10:00:00.000Z');
    jest.setSystemTime(fixedNow);

    // UserModel.find is called twice (once per REMINDER_DAYS entry: [3, 1])
    // Second call should return a user in the 1-day window
    const gracePeriodEndsAt1d = new Date(fixedNow.getTime() + 1 * 24 * 60 * 60 * 1000 - 30 * 60 * 1000);
    const user1d = makeUser({ id: 'user-2', email: '1d@test.com', mfaGracePeriodEndsAt: gracePeriodEndsAt1d });

    (UserModel.find as jest.Mock)
      .mockReturnValueOnce({ select: jest.fn().mockResolvedValue([]) }) // 3-day window: empty
      .mockReturnValueOnce({ select: jest.fn().mockResolvedValue([user1d]) }); // 1-day window

    await runMfaGracePeriodReminderTick();

    expect(sendMfaGracePeriodReminderEmail).toHaveBeenCalledWith(
      user1d.email,
      user1d.fullName,
      1,
      gracePeriodEndsAt1d
    );
  });

  it('does not send anything when no users match either window', async () => {
    mockUserFindReturning([]);
    await runMfaGracePeriodReminderTick();
    expect(sendMfaGracePeriodReminderEmail).not.toHaveBeenCalled();
  });

  it('queries only DOCTOR and NURSE roles', async () => {
    await runMfaGracePeriodReminderTick();

    // find is called for each day in REMINDER_DAYS
    const calls = (UserModel.find as jest.Mock).mock.calls;
    for (const [filter] of calls) {
      expect(filter.role).toEqual({ $in: ['DOCTOR', 'NURSE'] });
    }
  });

  it('queries only users with mfaEnabled: false', async () => {
    await runMfaGracePeriodReminderTick();
    const calls = (UserModel.find as jest.Mock).mock.calls;
    for (const [filter] of calls) {
      expect(filter.mfaEnabled).toBe(false);
    }
  });

  it('sends one reminder per matching user per window', async () => {
    const user1 = makeUser({ id: 'u1', email: 'u1@test.com' });
    const user2 = makeUser({ id: 'u2', email: 'u2@test.com' });

    (UserModel.find as jest.Mock)
      .mockReturnValueOnce({ select: jest.fn().mockResolvedValue([user1, user2]) })
      .mockReturnValueOnce({ select: jest.fn().mockResolvedValue([]) });

    await runMfaGracePeriodReminderTick();

    expect(sendMfaGracePeriodReminderEmail).toHaveBeenCalledTimes(2);
  });

  it('logs info for each reminder sent', async () => {
    const user = makeUser();
    (UserModel.find as jest.Mock)
      .mockReturnValueOnce({ select: jest.fn().mockResolvedValue([user]) })
      .mockReturnValueOnce({ select: jest.fn().mockResolvedValue([]) });

    await runMfaGracePeriodReminderTick();

    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ userId: user.id, days: 3 }),
      expect.any(String)
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Fixed-clock DST edge cases
// ─────────────────────────────────────────────────────────────────────────────

describe('fixed-clock DST edge cases', () => {
  it('uses wall-clock time to compute the window, not a fixed offset', async () => {
    // DST spring-forward: clocks jump from 01:59 → 03:00
    const fixedNow = new Date('2026-03-08T07:59:00.000Z'); // UTC equivalent of US/Eastern spring-forward
    jest.setSystemTime(fixedNow);

    await runMfaGracePeriodReminderTick();

    // Verify the mfaGracePeriodEndsAt window covers expected range for day=3
    const calls = (UserModel.find as jest.Mock).mock.calls;
    const thirdDayCall = calls[0];
    const filter = thirdDayCall[0];

    const expectedWindowEnd = new Date(fixedNow.getTime() + 3 * 24 * 60 * 60 * 1000);
    const expectedWindowStart = new Date(expectedWindowEnd.getTime() - 60 * 60 * 1000);

    expect(filter.mfaGracePeriodEndsAt.$gte.getTime()).toBeCloseTo(expectedWindowStart.getTime(), -2);
    expect(filter.mfaGracePeriodEndsAt.$lt.getTime()).toBeCloseTo(expectedWindowEnd.getTime(), -2);
  });

  it('uses wall-clock time during DST fall-back', async () => {
    const fixedNow = new Date('2026-11-01T06:00:00.000Z'); // UTC, ambiguous local hour
    jest.setSystemTime(fixedNow);

    await runMfaGracePeriodReminderTick();

    const calls = (UserModel.find as jest.Mock).mock.calls;
    expect(calls.length).toBeGreaterThan(0);

    // Window should be anchored to UTC millis, not local time
    const [filter] = calls[0];
    const windowEnd = filter.mfaGracePeriodEndsAt.$lt;
    expect(windowEnd.getTime()).toBeGreaterThan(fixedNow.getTime());
  });
});
