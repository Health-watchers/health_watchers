/**
 * Deterministic tests for waitlist-expiry-job using fake timers.
 *
 * Issue: #1487
 *
 * All external I/O is mocked — no real DB or network required.
 */

// ── Module mocks ───────────────────────────────────────────────────────────────

jest.mock('@api/modules/appointments/waitlist.model', () => ({
  WaitlistModel: {
    find: jest.fn(),
    updateMany: jest.fn(),
  },
}));

jest.mock('@api/modules/appointments/waitlist.service', () => ({
  notifyNextOnWaitlist: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@api/modules/appointments/appointment.model', () => ({
  AppointmentModel: {
    findOne: jest.fn(),
  },
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

import { WaitlistModel } from './waitlist.model';
import { notifyNextOnWaitlist } from './waitlist.service';
import { AppointmentModel } from './appointment.model';
import logger from '@api/utils/logger';
import {
  expireWaitlistEntries,
  startWaitlistExpiryJob,
  stopWaitlistExpiryJob,
} from './waitlist-expiry-job';

// ── Helpers ────────────────────────────────────────────────────────────────────

const CLINIC_ID = 'clinic-abc';
const DOCTOR_ID = 'doc-xyz';

function makeEntry(overrides: Record<string, unknown> = {}) {
  return {
    _id: 'wl-1',
    clinicId: CLINIC_ID,
    doctorId: DOCTOR_ID,
    status: 'notified',
    expiresAt: new Date(Date.now() - 1), // already expired
    ...overrides,
  };
}

function makeAppointment(overrides: Record<string, unknown> = {}) {
  return {
    _id: 'appt-1',
    clinicId: CLINIC_ID,
    doctorId: DOCTOR_ID,
    scheduledAt: new Date(Date.now() + 60 * 60 * 1000),
    status: 'scheduled',
    ...overrides,
  };
}

function mockFindResolving(items: unknown[]) {
  (WaitlistModel.find as jest.Mock).mockReturnValue({ lean: jest.fn().mockResolvedValue(items) });
}

function mockApptFindOne(appt: unknown | null) {
  (AppointmentModel.findOne as jest.Mock).mockReturnValue({
    sort: jest.fn().mockReturnThis(),
    lean: jest.fn().mockResolvedValue(appt),
  });
}

// ── Lifecycle ──────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  mockFindResolving([]);
  mockApptFindOne(null);
  (WaitlistModel.updateMany as jest.Mock).mockResolvedValue({});
});

afterEach(() => {
  stopWaitlistExpiryJob();
  jest.useRealTimers();
});

// ─────────────────────────────────────────────────────────────────────────────
// expireWaitlistEntries — core logic
// ─────────────────────────────────────────────────────────────────────────────

describe('expireWaitlistEntries — core logic', () => {
  it('returns 0 when no entries are expired', async () => {
    mockFindResolving([]);
    const count = await expireWaitlistEntries();
    expect(count).toBe(0);
    expect(WaitlistModel.updateMany).not.toHaveBeenCalled();
  });

  it('marks expired entries as "expired"', async () => {
    const entry = makeEntry();
    mockFindResolving([entry]);

    const count = await expireWaitlistEntries();

    expect(count).toBe(1);
    expect(WaitlistModel.updateMany).toHaveBeenCalledWith(
      { _id: { $in: [entry._id] } },
      { status: 'expired' }
    );
  });

  it('returns the number of entries expired', async () => {
    mockFindResolving([makeEntry({ _id: 'w1' }), makeEntry({ _id: 'w2' })]);
    const count = await expireWaitlistEntries();
    expect(count).toBe(2);
  });

  it('calls notifyNextOnWaitlist for each entry when an appointment exists', async () => {
    const entry = makeEntry();
    mockFindResolving([entry]);
    mockApptFindOne(makeAppointment());

    await expireWaitlistEntries();

    expect(notifyNextOnWaitlist).toHaveBeenCalledWith(
      expect.objectContaining({
        clinicId: CLINIC_ID,
        doctorId: DOCTOR_ID,
      })
    );
  });

  it('skips notifyNextOnWaitlist when no appointment is found', async () => {
    mockFindResolving([makeEntry()]);
    mockApptFindOne(null);

    await expireWaitlistEntries();

    expect(notifyNextOnWaitlist).not.toHaveBeenCalled();
  });

  it('logs how many entries were expired', async () => {
    mockFindResolving([makeEntry()]);
    await expireWaitlistEntries();
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ count: 1 }),
      expect.any(String)
    );
  });

  it('swallows errors from notifyNextOnWaitlist and continues', async () => {
    mockFindResolving([makeEntry({ _id: 'w1' }), makeEntry({ _id: 'w2' })]);
    mockApptFindOne(makeAppointment());
    (notifyNextOnWaitlist as jest.Mock).mockRejectedValue(new Error('notification failed'));

    // Should NOT throw
    await expect(expireWaitlistEntries()).resolves.toBe(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// startWaitlistExpiryJob — timer behaviour
// ─────────────────────────────────────────────────────────────────────────────

describe('startWaitlistExpiryJob — timer behaviour', () => {
  it('runs immediately on start', async () => {
    startWaitlistExpiryJob();
    await jest.runAllTimersAsync();
    expect(WaitlistModel.find).toHaveBeenCalled();
  });

  it('is idempotent — calling start twice does not add a second interval', async () => {
    startWaitlistExpiryJob();
    startWaitlistExpiryJob();
    await jest.runAllTimersAsync();
    const callsAfterTwoStarts = (WaitlistModel.find as jest.Mock).mock.calls.length;

    jest.advanceTimersByTime(15 * 60 * 1000);
    await jest.runAllTimersAsync();

    // Only one interval should tick
    const callsAfterOneTick = (WaitlistModel.find as jest.Mock).mock.calls.length;
    expect(callsAfterOneTick).toBeLessThanOrEqual(callsAfterTwoStarts + 1);
  });

  it('re-runs every 15 minutes', async () => {
    startWaitlistExpiryJob();
    await jest.runAllTimersAsync();
    const initialCalls = (WaitlistModel.find as jest.Mock).mock.calls.length;

    jest.advanceTimersByTime(15 * 60 * 1000);
    await jest.runAllTimersAsync();

    expect((WaitlistModel.find as jest.Mock).mock.calls.length).toBeGreaterThan(initialCalls);
  });

  it('stopWaitlistExpiryJob prevents future ticks', async () => {
    startWaitlistExpiryJob();
    await jest.runAllTimersAsync();
    stopWaitlistExpiryJob();
    const countAfterStop = (WaitlistModel.find as jest.Mock).mock.calls.length;

    jest.advanceTimersByTime(15 * 60 * 1000);
    await jest.runAllTimersAsync();

    expect((WaitlistModel.find as jest.Mock).mock.calls.length).toBe(countAfterStop);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Edge cases
// ─────────────────────────────────────────────────────────────────────────────

describe('edge cases', () => {
  it('queries entries whose expiresAt is <= now at the exact fixed clock time', async () => {
    const fixedNow = new Date('2026-11-01T01:59:59.000Z'); // DST fall-back ambiguous hour
    jest.setSystemTime(fixedNow);

    mockFindResolving([]);
    await expireWaitlistEntries();

    const [filter] = (WaitlistModel.find as jest.Mock).mock.calls[0];
    expect(filter.status).toBe('notified');
    expect(filter.expiresAt.$lte.getTime()).toBeCloseTo(fixedNow.getTime(), -2);
  });

  it('handles multiple expired entries for different clinics independently', async () => {
    const e1 = makeEntry({ _id: 'w1', clinicId: 'clinic-A' });
    const e2 = makeEntry({ _id: 'w2', clinicId: 'clinic-B' });
    mockFindResolving([e1, e2]);
    mockApptFindOne(makeAppointment());

    await expireWaitlistEntries();

    expect(WaitlistModel.updateMany).toHaveBeenCalledWith(
      { _id: { $in: ['w1', 'w2'] } },
      { status: 'expired' }
    );
    expect(notifyNextOnWaitlist).toHaveBeenCalledTimes(2);
  });

  it('handles already-processed records that are no longer in "notified" status', async () => {
    // An entry that slipped through but isn't actually 'notified' is never returned
    // by the query because we filter on status:'notified'.
    // This test verifies the query filter is applied correctly.
    mockFindResolving([]);
    const count = await expireWaitlistEntries();
    const [filter] = (WaitlistModel.find as jest.Mock).mock.calls[0];
    expect(filter.status).toBe('notified');
    expect(count).toBe(0);
  });
});
