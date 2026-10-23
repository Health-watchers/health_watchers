jest.mock('@api/middlewares/auth.middleware', () => ({
  authenticate: (req: any, _res: any, next: any) => {
    req.user = {
      userId: '64b7f0c2a1b2c3d4e5f60001',
      patientId: '64b7f0c2a1b2c3d4e5f60002',
      clinicId: '64b7f0c2a1b2c3d4e5f60003',
      role: 'PATIENT',
    };
    next();
  },
  requireRoles: () => (_req: any, _res: any, next: any) => next(),
}));
jest.mock('@api/utils/mailer', () => ({ sendMail: jest.fn().mockResolvedValue(undefined) }));
jest.mock('@api/utils/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));
jest.mock('../../audit/audit.service', () => ({ auditLog: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../../auth/models/user.model', () => ({
  UserModel: {
    findById: jest.fn().mockReturnValue({
      lean: () => Promise.resolve({ email: 'jane@example.com', fullName: 'Jane Doe' }),
    }),
  },
}));
jest.mock('../../patients/models/patient.model', () => ({
  PatientModel: {
    findById: jest.fn().mockReturnValue({ lean: () => Promise.resolve({ firstName: 'Jane', lastName: 'Doe' }) }),
  },
}));
jest.mock('../portal-payments.service', () => {
  const actual = jest.requireActual('../portal-payments.service');
  return {
    ...actual,
    changePlanStatus: jest.fn(),
    sendPlanChangeEmail: jest.fn().mockResolvedValue(true),
    listPatientPlans: jest.fn().mockResolvedValue([]),
  };
});

import express from 'express';
import request from 'supertest';
import { portalPaymentsRoutes } from '../portal-payments.routes';
import {
  PortalPaymentError,
  changePlanStatus,
  sendPlanChangeEmail,
} from '../portal-payments.service';

const app = express();
app.use(express.json());
app.use('/portal/payments', portalPaymentsRoutes);

const plan = {
  _id: '64b7f0c2a1b2c3d4e5f60009',
  amount: '50.00',
  currency: 'USDC',
  frequency: 'monthly',
  status: 'paused',
  nextPaymentDate: new Date('2026-11-01'),
  paymentHistory: [],
  toObject() {
    return { amount: this.amount, currency: this.currency, frequency: this.frequency };
  },
};

beforeEach(() => jest.clearAllMocks());

describe('POST /portal/payments/recurring/:id/:action', () => {
  it('pauses the plan and emails a confirmation', async () => {
    (changePlanStatus as jest.Mock).mockResolvedValue({ plan, from: 'active' });

    const res = await request(app)
      .post(`/portal/payments/recurring/${plan._id}/pause`)
      .send({ reason: 'Travelling' });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('paused');
    expect(res.body.meta.emailSent).toBe(true);
    expect(changePlanStatus).toHaveBeenCalledWith(
      expect.objectContaining({ patientId: '64b7f0c2a1b2c3d4e5f60002' }),
      plan._id,
      'pause',
      'Travelling'
    );
    expect(sendPlanChangeEmail).toHaveBeenCalledWith(
      'jane@example.com',
      expect.objectContaining({ change: 'paused', patientName: 'Jane Doe', reason: 'Travelling' })
    );
  });

  it('maps invalid transitions to 409', async () => {
    (changePlanStatus as jest.Mock).mockRejectedValue(
      new PortalPaymentError(409, 'Conflict', 'A cancelled plan cannot be resumed')
    );
    const res = await request(app).post(`/portal/payments/recurring/${plan._id}/resume`).send({});
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('Conflict');
    expect(sendPlanChangeEmail).not.toHaveBeenCalled();
  });

  it('rejects an over-long reason', async () => {
    const res = await request(app)
      .post(`/portal/payments/recurring/${plan._id}/cancel`)
      .send({ reason: 'x'.repeat(501) });
    expect(res.status).toBe(400);
    expect(changePlanStatus).not.toHaveBeenCalled();
  });
});

describe('POST /portal/payments/methods', () => {
  it('rejects raw card numbers in place of a token', async () => {
    const res = await request(app).post('/portal/payments/methods').send({
      processorToken: '4242424242424242',
      brand: 'visa',
      last4: '4242',
      expMonth: 12,
      expYear: 2030,
    });
    expect(res.status).toBe(400);
  });
});
