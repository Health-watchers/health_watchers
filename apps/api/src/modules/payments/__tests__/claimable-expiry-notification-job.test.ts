// ── Module mocks (hoisted before imports) ────────────────────────────────────

jest.mock('@api/modules/payments/models/payment-record.model', () => ({
  PaymentRecordModel: {
    find: jest.fn(),
    updateOne: jest.fn(),
  },
}));

jest.mock('@api/modules/auth/models/user.model', () => ({
  UserModel: {
    findById: jest.fn(),
  },
}));

jest.mock('@api/modules/notifications/notification.service', () => ({
  createNotification: jest.fn(),
}));

jest.mock('@api/lib/email.service', () => ({
  sendClaimableExpiryEmail: jest.fn(),
}));

jest.mock('@api/realtime/socket', () => ({
  emitToUser: jest.fn(),
}));

jest.mock('@api/utils/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

// ── Imports ───────────────────────────────────────────────────────────────────

import { PaymentRecordModel } from '../models/payment-record.model';
import { UserModel } from '../../auth/models/user.model';
import { createNotification } from '../../notifications/notification.service';
import { sendClaimableExpiryEmail } from '@api/lib/email.service';
import { emitToUser } from '@api/realtime/socket';
import logger from '@api/utils/logger';
import { sendClaimableExpiryNotifications } from '../services/claimable-expiry-notification-job';

const findMock = PaymentRecordModel.find as jest.Mock;
const updateOneMock = PaymentRecordModel.updateOne as jest.Mock;
const findByIdMock = UserModel.findById as jest.Mock;
const createNotificationMock = createNotification as jest.Mock;
const sendEmailMock = sendClaimableExpiryEmail as jest.Mock;
const emitToUserMock = emitToUser as jest.Mock;

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeRecord(overrides: Record<string, unknown> = {}) {
  return {
    _id: 'pay_1',
    intentId: 'intent_1',
    clinicId: 'clinic_1',
    patientId: 'patient_1',
    amount: '50',
    claimableBalanceId: 'cb_abc',
    claimableUntil: new Date(Date.now() + 12 * 60 * 60 * 1000), // 12h from now
    ...overrides,
  };
}

function makePatient(overrides: Record<string, unknown> = {}) {
  return {
    _id: 'patient_1',
    email: 'patient@example.com',
    fullName: 'Jane Doe',
    ...overrides,
  };
}

// lean() chain helper
function mockFind(records: unknown[]) {
  findMock.mockReturnValue({ lean: () => Promise.resolve(records) });
}

function mockFindById(patient: unknown) {
  findByIdMock.mockReturnValue({ lean: () => Promise.resolve(patient) });
}

// ── Lifecycle ─────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  updateOneMock.mockResolvedValue({ modifiedCount: 1 });
  createNotificationMock.mockResolvedValue({});
});

// ─────────────────────────────────────────────────────────────────────────────
// sendClaimableExpiryNotifications — no records
// ─────────────────────────────────────────────────────────────────────────────

describe('sendClaimableExpiryNotifications — no records', () => {
  it('returns 0 when no expiring balances found', async () => {
    mockFind([]);
    const count = await sendClaimableExpiryNotifications();
    expect(count).toBe(0);
    expect(createNotificationMock).not.toHaveBeenCalled();
  });

  it('does not send email when no records', async () => {
    mockFind([]);
    await sendClaimableExpiryNotifications();
    expect(sendEmailMock).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// sendClaimableExpiryNotifications — happy path
// ─────────────────────────────────────────────────────────────────────────────

describe('sendClaimableExpiryNotifications — happy path', () => {
  it('returns the count of notified records', async () => {
    mockFind([makeRecord()]);
    mockFindById(makePatient());

    const count = await sendClaimableExpiryNotifications();
    expect(count).toBe(1);
  });

  it('creates an in-app notification with correct type', async () => {
    mockFind([makeRecord()]);
    mockFindById(makePatient());

    await sendClaimableExpiryNotifications();

    expect(createNotificationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'claimable_expiring',
        userId: 'patient_1',
        clinicId: 'clinic_1',
      })
    );
  });

  it('emits payment:claimable_expiring socket event', async () => {
    const record = makeRecord();
    mockFind([record]);
    mockFindById(makePatient());

    await sendClaimableExpiryNotifications();

    expect(emitToUserMock).toHaveBeenCalledWith(
      'patient_1',
      'payment:claimable_expiring',
      expect.objectContaining({ claimableBalanceId: 'cb_abc', amount: '50' })
    );
  });

  it('sends email to patient', async () => {
    const record = makeRecord();
    mockFind([record]);
    mockFindById(makePatient());

    await sendClaimableExpiryNotifications();

    expect(sendEmailMock).toHaveBeenCalledWith(
      'patient@example.com',
      'Jane Doe',
      '50',
      record.claimableUntil
    );
  });

  it('marks claimableExpiryNotificationSent=true after notifying', async () => {
    mockFind([makeRecord()]);
    mockFindById(makePatient());

    await sendClaimableExpiryNotifications();

    expect(updateOneMock).toHaveBeenCalledWith(
      { _id: 'pay_1' },
      { claimableExpiryNotificationSent: true }
    );
  });

  it('handles multiple records', async () => {
    mockFind([makeRecord({ _id: 'pay_1' }), makeRecord({ _id: 'pay_2', patientId: 'patient_2' })]);
    findByIdMock
      .mockReturnValueOnce({ lean: () => Promise.resolve(makePatient()) })
      .mockReturnValueOnce({ lean: () => Promise.resolve(makePatient({ _id: 'patient_2', email: 'p2@example.com', fullName: 'John Smith' })) });

    const count = await sendClaimableExpiryNotifications();
    expect(count).toBe(2);
    expect(createNotificationMock).toHaveBeenCalledTimes(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// sendClaimableExpiryNotifications — edge cases
// ─────────────────────────────────────────────────────────────────────────────

describe('sendClaimableExpiryNotifications — edge cases', () => {
  it('skips records with no patientId', async () => {
    mockFind([makeRecord({ patientId: undefined })]);

    const count = await sendClaimableExpiryNotifications();
    expect(count).toBe(0);
    expect(createNotificationMock).not.toHaveBeenCalled();
  });

  it('skips records when patient not found in DB', async () => {
    mockFind([makeRecord()]);
    findByIdMock.mockReturnValue({ lean: () => Promise.resolve(null) });

    const count = await sendClaimableExpiryNotifications();
    expect(count).toBe(0);
    expect(createNotificationMock).not.toHaveBeenCalled();
  });

  it('does not send email when patient has no email', async () => {
    mockFind([makeRecord()]);
    mockFindById(makePatient({ email: undefined }));

    await sendClaimableExpiryNotifications();

    expect(sendEmailMock).not.toHaveBeenCalled();
    // But in-app notification should still be sent
    expect(createNotificationMock).toHaveBeenCalledTimes(1);
  });

  it('continues processing other records when one fails', async () => {
    mockFind([makeRecord({ _id: 'pay_1' }), makeRecord({ _id: 'pay_2' })]);
    findByIdMock
      .mockReturnValueOnce({ lean: () => Promise.reject(new Error('DB error')) })
      .mockReturnValueOnce({ lean: () => Promise.resolve(makePatient()) });

    const count = await sendClaimableExpiryNotifications();
    // First record failed, second succeeded
    expect(count).toBe(1);
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ paymentId: 'pay_1' }),
      expect.any(String)
    );
  });

  it('does not throw when socket emit fails', async () => {
    mockFind([makeRecord()]);
    mockFindById(makePatient());
    emitToUserMock.mockImplementation(() => { throw new Error('Socket not initialised'); });

    await expect(sendClaimableExpiryNotifications()).resolves.toBe(1);
    // Notification and email should still be sent
    expect(createNotificationMock).toHaveBeenCalledTimes(1);
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
  });

  it('uses fallback name "Patient" when fullName is missing', async () => {
    mockFind([makeRecord()]);
    mockFindById(makePatient({ fullName: undefined }));

    await sendClaimableExpiryNotifications();

    expect(sendEmailMock).toHaveBeenCalledWith(
      'patient@example.com',
      'Patient',
      expect.any(String),
      expect.any(Date)
    );
  });
});
