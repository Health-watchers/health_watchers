/**
 * Deterministic tests for appointment-reminder-job using fake timers.
 *
 * Issue: #1487
 *
 * All external I/O (Mongoose models, mailer, socket, notification service,
 * logger) is mocked — no real DB, network, or timer required.
 */

// ── Module mocks (hoisted before imports) ─────────────────────────────────────

jest.mock('@api/modules/appointments/appointment.model', () => ({
  AppointmentModel: {
    find: jest.fn(),
    updateOne: jest.fn(),
  },
}));

jest.mock('@api/modules/auth/models/user.model', () => ({
  UserModel: {
    findById: jest.fn(),
  },
}));

jest.mock('@api/modules/patients/models/patient.model', () => ({
  PatientModel: {},
}));

jest.mock('@api/modules/notifications/notification.service', () => ({
  createNotification: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@api/utils/mailer', () => ({
  sendMail: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@api/realtime/socket', () => ({
  emitToUser: jest.fn(),
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

import { AppointmentModel } from './appointment.model';
import { UserModel } from '../auth/models/user.model';
import { createNotification } from '../notifications/notification.service';
import { sendMail } from '@api/utils/mailer';
import { emitToUser } from '@api/realtime/socket';
import logger from '@api/utils/logger';
import {
  startAppointmentReminderJob,
  stopAppointmentReminderJob,
} from './appointment-reminder-job';

// ── Helpers ────────────────────────────────────────────────────────────────────

const clinicId = 'clinic-abc';

function makeAppointment(overrides: Record<string, unknown> = {}) {
  const doctorId = { _id: 'doc-1', firstName: 'Alice', lastName: 'Smith', email: 'alice@test.com' };
  const patientId = { _id: 'pat-1', firstName: 'Bob', lastName: 'Jones', email: 'bob@test.com' };
  return {
    _id: 'appt-1',
    clinicId,
    scheduledAt: new Date(Date.now() + 60 * 60 * 1000), // 1 hour from now
    status: 'scheduled',
    reminderSent24h: false,
    reminderSent1h: false,
    doctorId,
    patientId,
    ...overrides,
  };
}

function makeUserPrefs(notificationsEnabled = true) {
  return {
    lean: jest.fn().mockResolvedValue(
      notificationsEnabled
        ? { preferences: { notificationTypes: { appointment_reminder: true } } }
        : { preferences: { notificationTypes: { appointment_reminder: false } } }
    ),
  };
}

// ── Lifecycle ──────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();

  // Default: no appointments found
  (AppointmentModel.find as jest.Mock).mockReturnValue({
    populate: jest.fn().mockReturnThis(),
    then: undefined,
    [Symbol.iterator]: undefined,
  });

  // findById returns chainable .lean() — both doctor and patient opt-in
  (UserModel.findById as jest.Mock).mockReturnValue(makeUserPrefs(true));
  (AppointmentModel.updateOne as jest.Mock).mockResolvedValue({});

  // Fix find to resolve to empty array by default (using mockResolvedValue needs .populate chain)
  (AppointmentModel.find as jest.Mock).mockImplementation(() => ({
    populate: jest.fn().mockReturnThis(),
    // make the whole chain awaitable
    then: (resolve: (v: unknown[]) => void) => Promise.resolve([]).then(resolve),
    catch: (reject: (v: unknown) => void) => Promise.resolve([]).catch(reject),
  }));
});

afterEach(() => {
  stopAppointmentReminderJob();
  jest.useRealTimers();
});

// ── Helpers to mock find with results ─────────────────────────────────────────

function mockFindReturning(appointments: unknown[]) {
  (AppointmentModel.find as jest.Mock).mockImplementation(() => {
    const chain = {
      populate: jest.fn().mockReturnThis(),
    };
    return Object.assign(chain, {
      then: (resolve: (v: unknown[]) => void, reject?: (e: unknown) => void) =>
        Promise.resolve(appointments).then(resolve, reject),
      catch: (reject: (e: unknown) => void) => Promise.resolve(appointments).catch(reject),
    });
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// startAppointmentReminderJob — timer behaviour
// ─────────────────────────────────────────────────────────────────────────────

describe('startAppointmentReminderJob — timer behaviour', () => {
  it('is idempotent: calling start twice does not create two intervals', async () => {
    startAppointmentReminderJob();
    startAppointmentReminderJob();
    await jest.runAllTimersAsync();
    // find is called once on first start (immediate run), not twice
    // Two starts → still just one immediate invocation
    const callCount = (AppointmentModel.find as jest.Mock).mock.calls.length;
    expect(callCount).toBeLessThanOrEqual(2); // at most one batch of two queries
  });

  it('schedules the job to run again after 15 minutes', async () => {
    startAppointmentReminderJob();
    // Drain immediate run
    await jest.runAllTimersAsync();
    const afterFirst = (AppointmentModel.find as jest.Mock).mock.calls.length;

    // Advance 15 minutes
    jest.advanceTimersByTime(15 * 60 * 1000);
    await jest.runAllTimersAsync();

    expect((AppointmentModel.find as jest.Mock).mock.calls.length).toBeGreaterThan(afterFirst);
  });

  it('stopAppointmentReminderJob clears the interval', async () => {
    startAppointmentReminderJob();
    await jest.runAllTimersAsync();
    stopAppointmentReminderJob();
    const countAfterStop = (AppointmentModel.find as jest.Mock).mock.calls.length;

    jest.advanceTimersByTime(15 * 60 * 1000);
    await jest.runAllTimersAsync();

    // No new calls after stop
    expect((AppointmentModel.find as jest.Mock).mock.calls.length).toBe(countAfterStop);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// sendAppointmentReminders — 24h window
// ─────────────────────────────────────────────────────────────────────────────

describe('sendAppointmentReminders — 24h window', () => {
  it('sends email and notification for 24h reminder', async () => {
    const appt = makeAppointment({ reminderSent24h: false });
    mockFindReturning([appt]);

    startAppointmentReminderJob();
    await jest.runAllTimersAsync();

    expect(createNotification).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'appointment_reminder' })
    );
    expect(sendMail).toHaveBeenCalled();
  });

  it('marks reminderSent24h=true after sending', async () => {
    const appt = makeAppointment({ reminderSent24h: false });
    mockFindReturning([appt]);

    startAppointmentReminderJob();
    await jest.runAllTimersAsync();

    expect(AppointmentModel.updateOne).toHaveBeenCalledWith(
      { _id: appt._id },
      { reminderSent24h: true }
    );
  });

  it('sends reminder to both doctor and patient', async () => {
    const appt = makeAppointment();
    mockFindReturning([appt]);

    startAppointmentReminderJob();
    await jest.runAllTimersAsync();

    // createNotification called twice (once for doctor, once for patient)
    expect(createNotification).toHaveBeenCalledTimes(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Notification preferences — respects opt-out
// ─────────────────────────────────────────────────────────────────────────────

describe('notification preferences', () => {
  it('does NOT send if doctor has appointment_reminder notifications disabled', async () => {
    const appt = makeAppointment();
    mockFindReturning([appt]);

    // Doctor opts out, patient opts in
    (UserModel.findById as jest.Mock)
      .mockReturnValueOnce(makeUserPrefs(false)) // doctor
      .mockReturnValueOnce(makeUserPrefs(true)); // patient

    startAppointmentReminderJob();
    await jest.runAllTimersAsync();

    // Only one notification (for the patient), not two
    expect(createNotification).toHaveBeenCalledTimes(1);
    const [[firstCall]] = (createNotification as jest.Mock).mock.calls.map((c) => c);
    expect((firstCall as any).userId).toBe('pat-1');
  });

  it('does NOT send to patient if patient has notifications disabled', async () => {
    const appt = makeAppointment();
    mockFindReturning([appt]);

    (UserModel.findById as jest.Mock)
      .mockReturnValueOnce(makeUserPrefs(true)) // doctor
      .mockReturnValueOnce(makeUserPrefs(false)); // patient opts out

    startAppointmentReminderJob();
    await jest.runAllTimersAsync();

    // Only doctor gets notified
    expect(createNotification).toHaveBeenCalledTimes(1);
    const [[firstCall]] = (createNotification as jest.Mock).mock.calls.map((c) => c);
    expect((firstCall as any).userId).toBe('doc-1');
  });

  it('sends nothing when both doctor and patient opt out', async () => {
    const appt = makeAppointment();
    mockFindReturning([appt]);

    (UserModel.findById as jest.Mock)
      .mockReturnValueOnce(makeUserPrefs(false))
      .mockReturnValueOnce(makeUserPrefs(false));

    startAppointmentReminderJob();
    await jest.runAllTimersAsync();

    expect(createNotification).not.toHaveBeenCalled();
    expect(sendMail).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Edge cases
// ─────────────────────────────────────────────────────────────────────────────

describe('edge cases', () => {
  it('skips appointments with missing doctorId', async () => {
    const appt = makeAppointment({ doctorId: null });
    mockFindReturning([appt]);

    startAppointmentReminderJob();
    await jest.runAllTimersAsync();

    expect(createNotification).not.toHaveBeenCalled();
  });

  it('skips appointments with missing patientId', async () => {
    const appt = makeAppointment({ patientId: null });
    mockFindReturning([appt]);

    startAppointmentReminderJob();
    await jest.runAllTimersAsync();

    expect(createNotification).not.toHaveBeenCalled();
  });

  it('does not throw when emitToUser raises (socket not initialized)', async () => {
    const appt = makeAppointment();
    mockFindReturning([appt]);
    (emitToUser as jest.Mock).mockImplementation(() => {
      throw new Error('socket not ready');
    });

    startAppointmentReminderJob();
    await expect(jest.runAllTimersAsync()).resolves.not.toThrow();
  });

  it('handles zero upcoming appointments gracefully', async () => {
    mockFindReturning([]);

    startAppointmentReminderJob();
    await jest.runAllTimersAsync();

    expect(createNotification).not.toHaveBeenCalled();
    expect(sendMail).not.toHaveBeenCalled();
  });

  it('processes multiple appointments in a single tick', async () => {
    const appt1 = makeAppointment({ _id: 'appt-1' });
    const appt2 = makeAppointment({ _id: 'appt-2' });
    mockFindReturning([appt1, appt2]);

    startAppointmentReminderJob();
    await jest.runAllTimersAsync();

    // 2 appointments × 2 recipients = 4 notification calls
    expect(createNotification).toHaveBeenCalledTimes(4);
  });

  it('logs error and continues if the job encounters a DB error', async () => {
    (AppointmentModel.find as jest.Mock).mockImplementation(() => ({
      populate: jest.fn().mockReturnThis(),
      then: (_: unknown, reject: (e: Error) => void) =>
        reject ? reject(new Error('DB down')) : Promise.reject(new Error('DB down')),
      catch: (reject: (e: Error) => void) =>
        Promise.reject(new Error('DB down')).catch(reject),
    }));

    startAppointmentReminderJob();
    await jest.runAllTimersAsync();

    expect(logger.error).toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Fixed-clock / DST-safe window assertions
// ─────────────────────────────────────────────────────────────────────────────

describe('fixed-clock window assertions', () => {
  it('queries the correct 24h window from the fixed "now"', async () => {
    const fixedNow = new Date('2026-03-08T02:00:00.000Z'); // DST spring-forward
    jest.setSystemTime(fixedNow);

    mockFindReturning([]);
    startAppointmentReminderJob();
    await jest.runAllTimersAsync();

    // Verify AppointmentModel.find was called with a $lte close to now + 24h
    const [firstCallArgs] = (AppointmentModel.find as jest.Mock).mock.calls;
    const scheduledAtFilter = firstCallArgs[0]?.scheduledAt;
    expect(scheduledAtFilter?.$gte.getTime()).toBeCloseTo(fixedNow.getTime(), -2);
    expect(scheduledAtFilter?.$lte.getTime()).toBeCloseTo(
      fixedNow.getTime() + 24 * 60 * 60 * 1000,
      -2
    );
  });
});
