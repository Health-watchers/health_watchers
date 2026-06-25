import express from 'express';
import request from 'supertest';
import { Types } from 'mongoose';
import { portalRoutes } from './portal.controller';
import { patientRoutes } from '../patients/patients.controller';
import { UserModel } from '../auth/models/user.model';
import { PatientModel } from '../patients/models/patient.model';
import { PortalMessageModel } from './models/portal-message.model';
import { emitToClinic, emitToUser } from '@api/realtime/socket';
import { sendMail } from '@api/lib/email.service';

jest.mock('@api/middlewares/auth.middleware', () => {
  let currentUser: any = null;
  return {
    authenticate: (req: any, _res: any, next: any) => {
      req.user = currentUser;
      next();
    },
    requireRoles: () => (_req: any, _res: any, next: any) => next(),
    __setCurrentUser: (user: any) => {
      currentUser = user;
    },
  };
});

jest.mock('@api/realtime/socket', () => ({
  emitToClinic: jest.fn(),
  emitToUser: jest.fn(),
}));

jest.mock('@api/lib/email.service', () => ({
  sendMail: jest.fn(),
}));

const authMiddleware = require('@api/middlewares/auth.middleware');
const mockEmitToClinic = emitToClinic as jest.MockedFunction<typeof emitToClinic>;
const mockEmitToUser = emitToUser as jest.MockedFunction<typeof emitToUser>;
const mockSendMail = sendMail as jest.MockedFunction<typeof sendMail>;

describe('Portal messaging', () => {
  let app: express.Application;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use('/api/v1/portal', portalRoutes);
    app.use('/api/v1/patients', patientRoutes);

    jest.clearAllMocks();
  });

  it('should allow a patient to send a secure portal message', async () => {
    (authMiddleware.__setCurrentUser as Function)({
      userId: new Types.ObjectId().toString(),
      role: 'PATIENT',
      clinicId: new Types.ObjectId().toString(),
      patientId: new Types.ObjectId().toString(),
    });

    const patient = {
      _id: new Types.ObjectId(),
      firstName: 'Jane',
      lastName: 'Doe',
    };

    const message = {
      _id: new Types.ObjectId(),
      clinicId: new Types.ObjectId(),
      patientId: patient._id,
      senderId: new Types.ObjectId(),
      senderRole: 'PATIENT',
      subject: 'Test Subject',
      body: 'Test body',
      direction: 'patient_to_staff',
      threadId: new Types.ObjectId(),
      createdAt: new Date(),
      attachments: [],
    };

    jest.spyOn(PatientModel, 'findById').mockResolvedValue(patient as any);
    jest.spyOn(PortalMessageModel, 'create').mockResolvedValue(message as any);

    const response = await request(app)
      .post('/api/v1/portal/messages')
      .send({ subject: 'Test Subject', body: 'Test body' });

    expect(response.status).toBe(201);
    expect(response.body.data.subject).toBe('Test Subject');
    expect(response.body.data.direction).toBe('patient_to_staff');
    expect(mockEmitToClinic).toHaveBeenCalled();
    expect(mockSendMail).toHaveBeenCalled();
  });

  it('should return paginated message history for a patient', async () => {
    (authMiddleware.__setCurrentUser as Function)({
      userId: new Types.ObjectId().toString(),
      role: 'PATIENT',
      clinicId: new Types.ObjectId().toString(),
      patientId: new Types.ObjectId().toString(),
    });

    const doc = {
      _id: new Types.ObjectId(),
      clinicId: new Types.ObjectId(),
      patientId: new Types.ObjectId(),
      subject: 'Need help',
      body: 'Please help me',
      direction: 'patient_to_staff',
      threadId: new Types.ObjectId(),
      createdAt: new Date(),
      attachments: [],
    };

    jest.spyOn(PortalMessageModel, 'countDocuments').mockResolvedValue(1 as any);
    jest.spyOn(PortalMessageModel, 'find').mockReturnValue({
      sort: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue([doc]),
    } as any);

    const response = await request(app)
      .get('/api/v1/portal/messages')
      .query({ q: 'help', page: '1', limit: '10' });

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(1);
    expect(response.body.meta.page).toBe(1);
    expect(response.body.meta.limit).toBe(10);
  });

  it('should allow staff to reply to a patient message', async () => {
    const patientId = new Types.ObjectId();
    const staffId = new Types.ObjectId();

    (authMiddleware.__setCurrentUser as Function)({
      userId: staffId.toString(),
      role: 'DOCTOR',
      clinicId: new Types.ObjectId().toString(),
    });

    const patient = {
      _id: patientId,
      firstName: 'Jane',
      lastName: 'Doe',
      clinicId: new Types.ObjectId(),
      isActive: true,
    };

    const patientUser = {
      _id: new Types.ObjectId(),
      email: 'patient@example.com',
      preferences: { emailNotifications: true },
    };

    const message = {
      _id: new Types.ObjectId(),
      clinicId: new Types.ObjectId(),
      patientId,
      senderId: staffId,
      senderRole: 'DOCTOR',
      subject: 'Re: Test',
      body: 'We have received your message.',
      direction: 'staff_to_patient',
      threadId: new Types.ObjectId(),
      createdAt: new Date(),
      attachments: [],
    };

    jest.spyOn(PatientModel, 'findOne').mockResolvedValue(patient as any);
    jest.spyOn(UserModel, 'findOne').mockResolvedValue(patientUser as any);
    jest.spyOn(PortalMessageModel, 'create').mockResolvedValue(message as any);

    const response = await request(app)
      .post(`/api/v1/patients/${patientId.toString()}/messages`)
      .send({ subject: 'Re: Test', body: 'We have received your message.' });

    expect(response.status).toBe(201);
    expect(response.body.data.direction).toBe('staff_to_patient');
    expect(mockEmitToUser).toHaveBeenCalled();
    expect(mockEmitToClinic).toHaveBeenCalled();
    expect(mockSendMail).toHaveBeenCalled();
  });
});
