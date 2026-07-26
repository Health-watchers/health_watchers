/**
 * Appointment status Socket.IO event tests — verifies that each appointment
 * status change emits the correct real-time event (to the appointment room and
 * the clinic), creates the corresponding notification, and that the check-in
 * endpoint transitions an appointment to `patient_arrived`.
 *
 * Controller behaviour is exercised via supertest with mocked models and a
 * mocked SocketService.
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
    horizonUrl: '',
    stellarSecretKey: '',
    stellar: { network: 'testnet', horizonUrl: '', secretKey: '', platformPublicKey: '' },
    supportedAssets: ['XLM'],
    stellarServiceUrl: '',
    geminiApiKey: '',
    fieldEncryptionKey: '',
    webUrl: 'http://localhost:3000',
  },
}));

jest.mock('@api/utils/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

// ── SocketService mock ────────────────────────────────────────────────────────
const mockEmitAppointmentUpdate = jest.fn();
const mockEmitToClinic = jest.fn();
const mockSocketEmitToUser = jest.fn();
jest.mock('../../services/socket.service', () => ({
  SocketService: {
    getInstance: () => ({
      emitAppointmentUpdate: mockEmitAppointmentUpdate,
      emitToClinic: mockEmitToClinic,
      emitToUser: mockSocketEmitToUser,
    }),
  },
}));

// ── Realtime socket helper mock (used by video routes) ────────────────────────
jest.mock('@api/realtime/socket', () => ({
  emitToUser: jest.fn(),
  getIO: jest.fn(),
  emitToClinic: jest.fn(),
}));

// ── Model mocks ───────────────────────────────────────────────────────────────
const mockFindOne = jest.fn();
const mockFindByIdAndUpdate = jest.fn();
const mockCreate = jest.fn();
const mockCountDocuments = jest.fn();

jest.mock('@api/modules/appointments/appointment.model', () => ({
  AppointmentModel: {
    findOne: mockFindOne,
    findByIdAndUpdate: mockFindByIdAndUpdate,
    create: mockCreate,
    countDocuments: mockCountDocuments,
  },
}));

// ── Notification model mock ───────────────────────────────────────────────────
const mockNotificationCreate = jest.fn();
jest.mock('../notifications/notification.model', () => ({
  NotificationModel: { create: mockNotificationCreate },
}));

// ── Waitlist service mock (fire-and-forget on cancel) ─────────────────────────
const mockNotifyNextOnWaitlist = jest.fn().mockResolvedValue(undefined);
jest.mock('./waitlist.service', () => ({
  notifyNextOnWaitlist: mockNotifyNextOnWaitlist,
}));

// ── Auth middleware mock ──────────────────────────────────────────────────────
jest.mock('@api/middlewares/auth.middleware', () => ({
  authenticate: (req: any, _res: any, next: any) => {
    req.user = {
      userId: DOCTOR_ID,
      clinicId: CLINIC_ID,
      role: 'DOCTOR',
    };
    next();
  },
}));

import request from 'supertest';
import express from 'express';
import { Types } from 'mongoose';
import { appointmentRoutes } from './appointments.controller';

const CLINIC_ID = '507f1f77bcf86cd799439001';
const DOCTOR_ID = '507f1f77bcf86cd799439002';
const PATIENT_ID = '507f1f77bcf86cd799439003';
const APPT_ID = '507f1f77bcf86cd799439010';

const baseAppointment = {
  _id: APPT_ID,
  patientId: new Types.ObjectId(PATIENT_ID),
  doctorId: new Types.ObjectId(DOCTOR_ID),
  clinicId: new Types.ObjectId(CLINIC_ID),
  scheduledAt: new Date('2026-06-01T10:00:00Z'),
  duration: 30,
  type: 'consultation',
  status: 'confirmed',
  chiefComplaint: 'headache',
};

// findByIdAndUpdate is always chained with .lean() in the controller.
function leanResult(doc: unknown) {
  return { lean: () => Promise.resolve(doc) };
}

const app = express();
app.use(express.json());
app.use('/api/v1/appointments', appointmentRoutes);

beforeEach(() => {
  jest.clearAllMocks();
  mockNotifyNextOnWaitlist.mockResolvedValue(undefined);
});

// ── POST /:id/check-in ────────────────────────────────────────────────────────

describe('POST /api/v1/appointments/:id/check-in', () => {
  it('checks in a confirmed appointment and emits appointment:patient_arrived', async () => {
    mockFindOne.mockResolvedValue(baseAppointment);
    mockFindByIdAndUpdate.mockReturnValue(
      leanResult({ ...baseAppointment, status: 'patient_arrived', checkedInAt: new Date() }),
    );

    const res = await request(app).post(`/api/v1/appointments/${APPT_ID}/check-in`).send({});

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('success');

    // Emitted to the appointment room and to the clinic
    expect(mockEmitAppointmentUpdate).toHaveBeenCalledWith(
      APPT_ID,
      'appointment:patient_arrived',
      expect.objectContaining({ appointment: expect.any(Object) }),
    );
    expect(mockEmitToClinic).toHaveBeenCalledWith(
      CLINIC_ID,
      'appointment:patient_arrived',
      expect.objectContaining({ appointmentId: APPT_ID }),
    );

    // A status-update notification is created for the doctor
    expect(mockNotificationCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'appointment_status_update',
        metadata: expect.objectContaining({ status: 'patient_arrived' }),
      }),
    );
  });

  it('rejects check-in for an appointment that is not confirmed or scheduled', async () => {
    mockFindOne.mockResolvedValue({ ...baseAppointment, status: 'completed' });

    const res = await request(app).post(`/api/v1/appointments/${APPT_ID}/check-in`).send({});

    expect(res.status).toBe(400);
    expect(mockEmitAppointmentUpdate).not.toHaveBeenCalled();
    expect(mockNotificationCreate).not.toHaveBeenCalled();
  });

  it('returns 404 when the appointment does not exist', async () => {
    mockFindOne.mockResolvedValue(null);

    const res = await request(app).post(`/api/v1/appointments/${APPT_ID}/check-in`).send({});

    expect(res.status).toBe(404);
    expect(mockEmitAppointmentUpdate).not.toHaveBeenCalled();
  });
});

// ── PUT /:id (status change) ──────────────────────────────────────────────────

describe('PUT /api/v1/appointments/:id status changes', () => {
  it('emits appointment:confirmed when status transitions to confirmed', async () => {
    mockFindOne.mockResolvedValue({ ...baseAppointment, status: 'scheduled' });
    mockFindByIdAndUpdate.mockReturnValue(leanResult({ ...baseAppointment, status: 'confirmed' }));

    const res = await request(app)
      .put(`/api/v1/appointments/${APPT_ID}`)
      .send({ status: 'confirmed' });

    expect(res.status).toBe(200);
    expect(mockEmitAppointmentUpdate).toHaveBeenCalledWith(
      APPT_ID,
      'appointment:confirmed',
      expect.any(Object),
    );
    expect(mockEmitToClinic).toHaveBeenCalledWith(
      CLINIC_ID,
      'appointment:confirmed',
      expect.any(Object),
    );
    expect(mockNotificationCreate).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'appointment_status_update' }),
    );
  });

  it('does not emit a status event when status is unchanged', async () => {
    mockFindOne.mockResolvedValue({ ...baseAppointment, status: 'confirmed' });
    mockFindByIdAndUpdate.mockReturnValue(leanResult({ ...baseAppointment, status: 'confirmed' }));

    const res = await request(app)
      .put(`/api/v1/appointments/${APPT_ID}`)
      .send({ status: 'confirmed' });

    expect(res.status).toBe(200);
    expect(mockEmitAppointmentUpdate).not.toHaveBeenCalled();
  });

  it('emits appointment:rescheduled when the scheduled time changes', async () => {
    mockFindOne.mockResolvedValue({ ...baseAppointment });
    mockCountDocuments.mockResolvedValue(0);
    mockFindByIdAndUpdate.mockReturnValue(
      leanResult({ ...baseAppointment, scheduledAt: new Date('2026-06-02T11:00:00Z') }),
    );

    const res = await request(app)
      .put(`/api/v1/appointments/${APPT_ID}`)
      .send({ scheduledAt: '2026-06-02T11:00:00.000Z' });

    expect(res.status).toBe(200);
    expect(mockEmitAppointmentUpdate).toHaveBeenCalledWith(
      APPT_ID,
      'appointment:rescheduled',
      expect.objectContaining({
        oldScheduledAt: expect.any(String),
        newScheduledAt: expect.any(String),
      }),
    );
  });
});

// ── DELETE /:id (cancel) ──────────────────────────────────────────────────────

describe('DELETE /api/v1/appointments/:id (cancel)', () => {
  it('emits appointment:cancelled and notifies patient and doctor', async () => {
    mockFindOne.mockResolvedValue(baseAppointment);
    mockFindByIdAndUpdate.mockReturnValue(leanResult({ ...baseAppointment, status: 'cancelled' }));

    const res = await request(app)
      .delete(`/api/v1/appointments/${APPT_ID}`)
      .send({ cancellationReason: 'Patient requested cancellation' });

    expect(res.status).toBe(200);
    expect(mockEmitAppointmentUpdate).toHaveBeenCalledWith(
      APPT_ID,
      'appointment:cancelled',
      expect.objectContaining({ cancellationReason: 'Patient requested cancellation' }),
    );
    expect(mockEmitToClinic).toHaveBeenCalledWith(
      CLINIC_ID,
      'appointment:cancelled',
      expect.any(Object),
    );
    // One notification each for patient and doctor
    expect(mockNotificationCreate).toHaveBeenCalledTimes(2);
  });

  it('returns 404 when cancelling a missing appointment', async () => {
    mockFindOne.mockResolvedValue(null);

    const res = await request(app)
      .delete(`/api/v1/appointments/${APPT_ID}`)
      .send({ cancellationReason: 'No longer needed' });

    expect(res.status).toBe(404);
    expect(mockEmitAppointmentUpdate).not.toHaveBeenCalled();
  });
});

// ── POST / (create) ───────────────────────────────────────────────────────────

describe('POST /api/v1/appointments (create)', () => {
  it('does not emit a status event for the unmapped scheduled status', async () => {
    mockCountDocuments.mockResolvedValue(0);
    mockCreate.mockResolvedValue({
      ...baseAppointment,
      _id: new Types.ObjectId(APPT_ID),
      status: 'scheduled',
    });

    const res = await request(app)
      .post('/api/v1/appointments')
      .send({
        patientId: PATIENT_ID,
        doctorId: DOCTOR_ID,
        scheduledAt: '2026-07-01T09:00:00.000Z',
        duration: 30,
        type: 'consultation',
        chiefComplaint: 'checkup',
      });

    expect(res.status).toBe(201);
    // 'scheduled' is not in the event map, so no real-time status event fires
    expect(mockEmitAppointmentUpdate).not.toHaveBeenCalled();
    // A reminder notification is still created for the doctor
    expect(mockNotificationCreate).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'appointment_reminder' }),
    );
  });
});
