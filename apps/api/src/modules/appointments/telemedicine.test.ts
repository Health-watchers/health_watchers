/**
 * Telemedicine flow tests — video room creation, start/end, Socket.IO events,
 * recording consent, and duration calculation.
 * Tests service logic and controller behaviour via mocked models.
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

// ── Socket.IO mock ────────────────────────────────────────────────────────────
const mockEmitToUser = jest.fn();
jest.mock('@api/realtime/socket', () => ({
  emitToUser: mockEmitToUser,
  getIO: jest.fn(),
  emitToClinic: jest.fn(),
}));

// ── Model mocks ───────────────────────────────────────────────────────────────
const mockFindOne = jest.fn();
const mockFindByIdAndUpdate = jest.fn();
const mockCreate = jest.fn();

jest.mock('@api/modules/appointments/appointment.model', () => ({
  AppointmentModel: {
    findOne: mockFindOne,
    findByIdAndUpdate: mockFindByIdAndUpdate,
  },
}));

jest.mock('@api/modules/encounters/encounter.model', () => ({
  EncounterModel: { create: mockCreate },
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
import { createVideoRoom, generateVideoToken, calculateVideoDuration } from './telemedicine.service';
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
  isTelemedicine: true,
  videoRoomId: 'room-abc123',
  videoRoomUrl: 'https://health-watchers.daily.co/room-abc123',
  videoProvider: 'daily.co',
  chiefComplaint: 'headache',
};

// Build a minimal Express app for integration-style tests
const app = express();
app.use(express.json());
app.use('/api/v1/appointments', appointmentRoutes);

beforeEach(() => {
  jest.clearAllMocks();
});

// ── telemedicine.service unit tests ───────────────────────────────────────────

describe('createVideoRoom', () => {
  it('returns a daily.co room config', async () => {
    const room = await createVideoRoom('daily.co');
    expect(room.provider).toBe('daily.co');
    expect(room.roomId).toMatch(/^room-/);
    expect(room.roomUrl).toContain(room.roomId);
  });

  it('returns a jitsi room config', async () => {
    const room = await createVideoRoom('jitsi');
    expect(room.provider).toBe('jitsi');
    expect(room.roomUrl).toContain('meet.jit.si');
  });

  it('returns a twilio_video room config', async () => {
    const room = await createVideoRoom('twilio_video');
    expect(room.provider).toBe('twilio_video');
    expect(room.roomId).toBeTruthy();
  });

  it('defaults to daily.co when no provider given', async () => {
    const room = await createVideoRoom();
    expect(room.provider).toBe('daily.co');
  });
});

describe('generateVideoToken', () => {
  it('generates a token for daily.co', async () => {
    const token = await generateVideoToken('room-1', 'Doctor', 'daily.co');
    expect(token.roomId).toBe('room-1');
    expect(token.provider).toBe('daily.co');
    expect(token.token).toBeTruthy();
  });

  it('generates a token for jitsi', async () => {
    const token = await generateVideoToken('room-2', 'Patient', 'jitsi');
    expect(token.provider).toBe('jitsi');
  });

  it('generates a token for twilio_video', async () => {
    const token = await generateVideoToken('room-3', 'Doctor', 'twilio_video');
    expect(token.provider).toBe('twilio_video');
  });
});

describe('calculateVideoDuration', () => {
  it('calculates duration in minutes', () => {
    const start = new Date('2026-06-01T10:00:00Z');
    const end = new Date('2026-06-01T10:30:00Z');
    expect(calculateVideoDuration(start, end)).toBe(30);
  });

  it('rounds to nearest minute', () => {
    const start = new Date('2026-06-01T10:00:00Z');
    const end = new Date('2026-06-01T10:00:45Z'); // 45 seconds → rounds to 1
    expect(calculateVideoDuration(start, end)).toBe(1);
  });

  it('returns 0 for same start and end', () => {
    const t = new Date();
    expect(calculateVideoDuration(t, t)).toBe(0);
  });
});

// ── POST /video/start ─────────────────────────────────────────────────────────

describe('POST /api/v1/appointments/:id/video/start', () => {
  it('starts a video session and emits Socket.IO events to doctor and patient', async () => {
    mockFindOne.mockResolvedValue(baseAppointment);
    mockFindByIdAndUpdate.mockResolvedValue({ ...baseAppointment, videoStartedAt: new Date() });

    const res = await request(app)
      .post(`/api/v1/appointments/${APPT_ID}/video/start`)
      .send({ recordingConsent: true });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('success');

    // Socket.IO events emitted to both parties
    expect(mockEmitToUser).toHaveBeenCalledTimes(2);
    expect(mockEmitToUser).toHaveBeenCalledWith(
      DOCTOR_ID,
      'appointment:video_started',
      expect.objectContaining({ appointmentId: APPT_ID, recordingConsent: true }),
    );
    expect(mockEmitToUser).toHaveBeenCalledWith(
      PATIENT_ID,
      'appointment:video_started',
      expect.objectContaining({ appointmentId: APPT_ID, recordingConsent: true }),
    );
  });

  it('starts without recording consent (defaults to false)', async () => {
    mockFindOne.mockResolvedValue(baseAppointment);
    mockFindByIdAndUpdate.mockResolvedValue({ ...baseAppointment, videoStartedAt: new Date() });

    const res = await request(app)
      .post(`/api/v1/appointments/${APPT_ID}/video/start`)
      .send({});

    expect(res.status).toBe(200);
    expect(mockEmitToUser).toHaveBeenCalledWith(
      DOCTOR_ID,
      'appointment:video_started',
      expect.objectContaining({ recordingConsent: false }),
    );
  });

  it('returns 404 when appointment not found', async () => {
    mockFindOne.mockResolvedValue(null);

    const res = await request(app)
      .post(`/api/v1/appointments/${APPT_ID}/video/start`)
      .send({});

    expect(res.status).toBe(404);
    expect(mockEmitToUser).not.toHaveBeenCalled();
  });

  it('returns 400 when appointment has no video room', async () => {
    mockFindOne.mockResolvedValue({ ...baseAppointment, isTelemedicine: false, videoRoomId: undefined });

    const res = await request(app)
      .post(`/api/v1/appointments/${APPT_ID}/video/start`)
      .send({});

    expect(res.status).toBe(400);
    expect(mockEmitToUser).not.toHaveBeenCalled();
  });
});

// ── POST /video/end ───────────────────────────────────────────────────────────

describe('POST /api/v1/appointments/:id/video/end', () => {
  const startedAppointment = {
    ...baseAppointment,
    videoStartedAt: new Date('2026-06-01T10:00:00Z'),
  };

  it('ends a video session, emits events, and creates an encounter', async () => {
    mockFindOne.mockResolvedValue(startedAppointment);
    mockFindByIdAndUpdate
      .mockResolvedValueOnce({ ...startedAppointment, status: 'completed', videoDuration: 30 })
      .mockResolvedValueOnce(undefined); // link encounter
    mockCreate.mockResolvedValue({ _id: 'enc-1', type: 'telemedicine' });

    const res = await request(app)
      .post(`/api/v1/appointments/${APPT_ID}/video/end`)
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('success');
    expect(res.body.data.encounter).toBeDefined();

    // Socket.IO events emitted to both parties
    expect(mockEmitToUser).toHaveBeenCalledTimes(2);
    expect(mockEmitToUser).toHaveBeenCalledWith(
      DOCTOR_ID,
      'appointment:video_ended',
      expect.objectContaining({ appointmentId: APPT_ID }),
    );
    expect(mockEmitToUser).toHaveBeenCalledWith(
      PATIENT_ID,
      'appointment:video_ended',
      expect.objectContaining({ appointmentId: APPT_ID }),
    );
  });

  it('creates a telemedicine encounter on video end', async () => {
    mockFindOne.mockResolvedValue(startedAppointment);
    mockFindByIdAndUpdate.mockResolvedValue({ ...startedAppointment, status: 'completed' });
    mockCreate.mockResolvedValue({ _id: 'enc-2', type: 'telemedicine', status: 'open' });

    const res = await request(app)
      .post(`/api/v1/appointments/${APPT_ID}/video/end`)
      .send({});

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'telemedicine', status: 'open' }),
    );
    expect(res.body.data.encounter.type).toBe('telemedicine');
  });

  it('returns 404 when appointment not found', async () => {
    mockFindOne.mockResolvedValue(null);

    const res = await request(app)
      .post(`/api/v1/appointments/${APPT_ID}/video/end`)
      .send({});

    expect(res.status).toBe(404);
    expect(mockEmitToUser).not.toHaveBeenCalled();
  });

  it('returns 400 when video session was never started', async () => {
    mockFindOne.mockResolvedValue({ ...baseAppointment, videoStartedAt: undefined });

    const res = await request(app)
      .post(`/api/v1/appointments/${APPT_ID}/video/end`)
      .send({});

    expect(res.status).toBe(400);
    expect(mockEmitToUser).not.toHaveBeenCalled();
  });
});

// ── POST /video-room ──────────────────────────────────────────────────────────

describe('POST /api/v1/appointments/:id/video-room', () => {
  it('creates a video room and stores videoRoomUrl on the appointment', async () => {
    const apptWithoutRoom = { ...baseAppointment, videoRoomId: undefined, videoRoomUrl: undefined };
    mockFindOne.mockResolvedValue(apptWithoutRoom);
    mockFindByIdAndUpdate.mockResolvedValue({
      ...apptWithoutRoom,
      isTelemedicine: true,
      videoRoomId: 'room-xyz',
      videoRoomUrl: 'https://health-watchers.daily.co/room-xyz',
    });

    const res = await request(app)
      .post(`/api/v1/appointments/${APPT_ID}/video-room`)
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.data.videoRoom.roomUrl).toBeTruthy();
    expect(mockFindByIdAndUpdate).toHaveBeenCalledWith(
      APPT_ID,
      expect.objectContaining({ videoRoomUrl: expect.any(String) }),
      expect.any(Object),
    );
  });

  it('returns 404 when appointment not found', async () => {
    mockFindOne.mockResolvedValue(null);

    const res = await request(app)
      .post(`/api/v1/appointments/${APPT_ID}/video-room`)
      .send({});

    expect(res.status).toBe(404);
  });
});
