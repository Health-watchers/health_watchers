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
    findByIdAndUpdate: jest.fn().mockResolvedValue({}),
    exists: jest.fn().mockResolvedValue(false),
  },
}));

jest.mock('@api/modules/clinics/clinic-keypair.model', () => ({
  ClinicKeypairModel: {
    findOne: jest.fn().mockReturnValue({
      sort: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue({ keyVersion: 1 }) }),
    }),
    create: jest.fn().mockResolvedValue({ _id: 'kp-id' }),
    findByIdAndUpdate: jest.fn().mockResolvedValue({}),
    findByIdAndDelete: jest.fn().mockResolvedValue({}),
    updateMany: jest.fn().mockResolvedValue({}),
  },
}));

jest.mock('@api/modules/clinics/keypair.service', () => ({
  generateClinicKeypair: jest.fn().mockReturnValue({
    publicKey: 'GNEWPUBLICKEY',
    encryptedSecretKey: 'enc',
    iv: 'iv',
  }),
  rotateClinicKeypair: jest.fn(),
}));

jest.mock('@api/modules/audit/audit.service', () => ({
  auditLog: jest.fn(),
}));

jest.mock('@api/lib/email.service', () => ({
  sendKeypairRotationEmail: jest.fn(),
}));

jest.mock('@api/modules/auth/models/user.model', () => ({
  UserModel: {
    updateMany: jest.fn().mockResolvedValue({}),
    findOne: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue({ email: 'admin@test.com' }) }),
  },
}));

jest.mock('@api/modules/clinics/clinic-settings.model', () => ({
  ClinicSettingsModel: { create: jest.fn().mockResolvedValue({}) },
}));

jest.mock('@api/modules/payments/services/stellar-client', () => ({
  stellarClient: { fundAccount: jest.fn().mockResolvedValue({}), transferBalance: jest.fn() },
}));

import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '@api/app';
import { ClinicModel } from './clinic.model';
import { rotateClinicKeypair } from './keypair.service';
import { auditLog } from '@api/modules/audit/audit.service';
import { sendKeypairRotationEmail } from '@api/lib/email.service';

function makeToken(role: string, clinicId: string) {
  return jwt.sign(
    { userId: '507f1f77bcf86cd799439011', role, clinicId },
    'abcdefghijklmnopqrstuvwxyz012345',
    {
      expiresIn: '15m',
      issuer: 'health-watchers-api',
      audience: 'health-watchers-client',
    }
  );
}

describe('Clinics API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('allows SUPER_ADMIN to create clinic', async () => {
    const clinicData = {
      name: 'Test Clinic',
      address: '123 Main St',
      phone: '555-0100',
      email: 'clinic@test.com',
      subscriptionTier: 'free',
    };
    (ClinicModel.create as jest.Mock).mockResolvedValue({ _id: 'clinic1', ...clinicData });

    const res = await request(app)
      .post('/api/v1/clinics')
      .set('Authorization', `Bearer ${makeToken('SUPER_ADMIN', 'clinic1')}`)
      .send(clinicData);

    expect(res.status).toBe(201);
    expect(res.body.status).toBe('success');
    expect(res.body.data.name).toBe('Test Clinic');
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

describe('POST /api/v1/clinics/:id/keypair/rotate', () => {
  const CLINIC_ID = '507f1f77bcf86cd799439011';

  beforeEach(() => {
    jest.clearAllMocks();
    (ClinicModel.findById as jest.Mock).mockResolvedValue({
      _id: CLINIC_ID,
      name: 'Test Clinic',
      stellarPublicKey: 'GOLDKEY',
    });
    (rotateClinicKeypair as jest.Mock).mockResolvedValue({
      publicKey: 'GNEWKEY',
      keyVersion: 2,
      transferResult: { transferred: true, amount: '10', hash: 'txhash' },
    });
  });

  it('returns 200 with new publicKey and keyVersion on success', async () => {
    const res = await request(app)
      .post(`/api/v1/clinics/${CLINIC_ID}/keypair/rotate`)
      .set('Authorization', `Bearer ${makeToken('SUPER_ADMIN', CLINIC_ID)}`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('success');
    expect(res.body.data.publicKey).toBe('GNEWKEY');
    expect(res.body.data.keyVersion).toBe(2);
  });

  it('calls rotateClinicKeypair with correct clinicId', async () => {
    await request(app)
      .post(`/api/v1/clinics/${CLINIC_ID}/keypair/rotate`)
      .set('Authorization', `Bearer ${makeToken('SUPER_ADMIN', CLINIC_ID)}`);

    expect(rotateClinicKeypair).toHaveBeenCalledWith(
      CLINIC_ID,
      expect.objectContaining({ stellarNetwork: 'testnet' }),
    );
  });

  it('records KEYPAIR_ROTATE audit log after successful rotation', async () => {
    await request(app)
      .post(`/api/v1/clinics/${CLINIC_ID}/keypair/rotate`)
      .set('Authorization', `Bearer ${makeToken('SUPER_ADMIN', CLINIC_ID)}`);

    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'KEYPAIR_ROTATE',
        resourceType: 'Clinic',
        resourceId: CLINIC_ID,
        metadata: expect.objectContaining({ newPublicKey: 'GNEWKEY', keyVersion: 2 }),
      }),
      expect.anything(),
    );
  });

  it('sends email notification to clinic admin after successful rotation', async () => {
    await request(app)
      .post(`/api/v1/clinics/${CLINIC_ID}/keypair/rotate`)
      .set('Authorization', `Bearer ${makeToken('SUPER_ADMIN', CLINIC_ID)}`);

    expect(sendKeypairRotationEmail).toHaveBeenCalledWith(
      'admin@test.com',
      'Test Clinic',
      'GNEWKEY',
      2,
    );
  });

  it('returns 404 when clinic is not found', async () => {
    (ClinicModel.findById as jest.Mock).mockResolvedValue(null);

    const res = await request(app)
      .post(`/api/v1/clinics/${CLINIC_ID}/keypair/rotate`)
      .set('Authorization', `Bearer ${makeToken('SUPER_ADMIN', CLINIC_ID)}`);

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('NotFound');
  });

  it('returns 500 and does NOT send email when rotation fails', async () => {
    (rotateClinicKeypair as jest.Mock).mockRejectedValue(new Error('Transfer failed'));

    const res = await request(app)
      .post(`/api/v1/clinics/${CLINIC_ID}/keypair/rotate`)
      .set('Authorization', `Bearer ${makeToken('SUPER_ADMIN', CLINIC_ID)}`);

    expect(res.status).toBe(500);
    expect(res.body.error).toBe('RotationFailed');
    expect(sendKeypairRotationEmail).not.toHaveBeenCalled();
  });

  it('denies non-SUPER_ADMIN access', async () => {
    const res = await request(app)
      .post(`/api/v1/clinics/${CLINIC_ID}/keypair/rotate`)
      .set('Authorization', `Bearer ${makeToken('CLINIC_ADMIN', CLINIC_ID)}`);

    expect(res.status).toBe(403);
  });
});
