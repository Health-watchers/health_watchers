/**
 * Unit tests for clinics endpoints.
 */

process.env.MONGO_URI = 'mongodb://localhost:27017/test';
process.env.JWT_ACCESS_TOKEN_SECRET = 'abcdefghijklmnopqrstuvwxyz012345';
process.env.JWT_REFRESH_TOKEN_SECRET = 'abcdefghijklmnopqrstuvwxyz012345';
process.env.API_PORT = '3001';

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

jest.mock('@api/modules/auth/auth.controller', () => ({ authRoutes: require('express').Router() }));
jest.mock('@api/modules/patients/patients.controller', () => ({
  patientRoutes: require('express').Router(),
}));
jest.mock('@api/modules/encounters/encounters.controller', () => ({
  encounterRoutes: require('express').Router(),
}));
jest.mock('@api/modules/payments/payments.controller', () => ({
  paymentRoutes: require('express').Router(),
}));
jest.mock('@api/modules/ai/ai.routes', () => require('express').Router());
jest.mock('@api/modules/dashboard/dashboard.routes', () => require('express').Router());
jest.mock('@api/modules/appointments/appointments.controller', () => ({
  appointmentRoutes: require('express').Router(),
}));

jest.mock('@api/config/db', () => ({
  connectDB: jest.fn().mockReturnValue(new Promise(() => {})),
}));
jest.mock('@api/docs/swagger', () => ({ setupSwagger: jest.fn() }));
jest.mock('@api/modules/payments/services/payment-expiration-job', () => ({
  startPaymentExpirationJob: jest.fn(),
  stopPaymentExpirationJob: jest.fn(),
}));
jest.mock('@api/utils/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

jest.mock('@api/modules/clinics/clinic.model', () => ({
  ClinicModel: {
    create: jest.fn(),
    findById: jest.fn(),
  },
}));

import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '@api/app';
import { ClinicModel } from './clinic.model';

function makeToken(role: string, clinicId: string) {
  return jwt.sign(
    { userId: '507f1f77bcf86cd799439011', role, clinicId },
    'abcdefghijklmnopqrstuvwxyz012345',
    {
      expiresIn: '15m',
      issuer: 'health-watchers-api',
      audience: 'health-watchers-client',
    },
  );
}

describe('Clinics API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('allows SUPER_ADMIN to create clinic', async () => {
    const clinicData = { name: 'Test Clinic', stellarPublicKey: 'GTESTKEY', isActive: true };
    (ClinicModel.create as jest.Mock).mockResolvedValue({ _id: 'clinic1', ...clinicData });

    const res = await request(app)
      .post('/api/v1/clinics')
      .set('Authorization', `Bearer ${makeToken('SUPER_ADMIN', 'clinic1')}`)
      .send(clinicData);

    expect(res.status).toBe(201);
    expect(res.body.status).toBe('success');
    expect(res.body.data.name).toBe('Test Clinic');
    expect(ClinicModel.create).toHaveBeenCalledWith(expect.objectContaining(clinicData));
  });

  it('returns clinic to CLINIC_ADMIN of that clinic', async () => {
    const clinic = {
      _id: 'clinic1',
      name: 'Test Clinic',
      stellarPublicKey: 'GTESTKEY',
      isActive: true,
    };
    (ClinicModel.findById as jest.Mock).mockResolvedValue(clinic);

    const res = await request(app)
      .get('/api/v1/clinics/clinic1')
      .set('Authorization', `Bearer ${makeToken('CLINIC_ADMIN', 'clinic1')}`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('success');
    expect(res.body.data.name).toBe('Test Clinic');
  });

  it('denies CLINIC_ADMIN for a different clinic', async () => {
    (ClinicModel.findById as jest.Mock).mockResolvedValue({
      _id: 'clinic1',
      name: 'Other',
      stellarPublicKey: 'GTESTKEY',
      isActive: true,
    });

    const res = await request(app)
      .get('/api/v1/clinics/clinic1')
      .set('Authorization', `Bearer ${makeToken('CLINIC_ADMIN', 'clinic2')}`);

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('Forbidden');
  });
});
