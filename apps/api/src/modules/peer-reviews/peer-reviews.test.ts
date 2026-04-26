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
    stellar: { network: 'testnet', horizonUrl: '', secretKey: '', platformPublicKey: '' },
    supportedAssets: ['XLM'],
    stellarServiceUrl: '',
    geminiApiKey: '',
    fieldEncryptionKey: '',
  },
}));

jest.mock('@api/utils/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));
jest.mock('@api/realtime/socket', () => ({ emitToUser: jest.fn() }));
jest.mock('@api/modules/notifications/notification.service', () => ({
  createNotification: jest.fn().mockResolvedValue(null),
}));

// Bypass real JWT auth — inject req.user from test context
jest.mock('@api/middlewares/auth.middleware', () => ({
  authenticate: (req: any, _res: any, next: any) => { next(); },
  requireRoles: (..._roles: string[]) => (_req: any, _res: any, next: any) => { next(); },
}));

import request from 'supertest';
import express from 'express';
import { Types } from 'mongoose';
import peerReviewsRouter from './peer-reviews.router';
import { PeerReviewModel } from './peer-review.model';
import { EncounterModel } from '../encounters/encounter.model';
import { UserModel } from '../auth/models/user.model';
import { createNotification } from '../notifications/notification.service';

jest.mock('./peer-review.model');
jest.mock('../encounters/encounter.model');
jest.mock('../auth/models/user.model');

// ── IDs ───────────────────────────────────────────────────────────────────────
const CLINIC_ID    = new Types.ObjectId().toHexString();
const ADMIN_ID     = new Types.ObjectId().toHexString();
const DOCTOR_ID    = new Types.ObjectId().toHexString();
const REVIEWER_ID  = new Types.ObjectId().toHexString();
const ENCOUNTER_ID = new Types.ObjectId().toHexString();

function buildApp(userId: string, role: string, clinicId = CLINIC_ID) {
  const app = express();
  app.use(express.json());
  app.use((req: any, _res: any, next: any) => { req.user = { userId, role, clinicId }; next(); });
  app.use('/', peerReviewsRouter);
  return app;
}

const adminApp    = buildApp(ADMIN_ID,    'CLINIC_ADMIN');
const reviewerApp = buildApp(REVIEWER_ID, 'DOCTOR');

const mockPRCreate    = PeerReviewModel.create    as jest.Mock;
const mockPRFindOne   = PeerReviewModel.findOne   as jest.Mock;
const mockPRFind      = PeerReviewModel.find      as jest.Mock;
const mockEncFindOne  = EncounterModel.findOne    as jest.Mock;
const mockUserFindOne = UserModel.findOne         as jest.Mock;
const mockUserFindById = UserModel.findById       as jest.Mock;

beforeEach(() => jest.clearAllMocks());

// ── Assignment ────────────────────────────────────────────────────────────────

describe('POST / — assign encounter for review', () => {
  it('creates a peer review when valid', async () => {
    mockEncFindOne.mockReturnValue({ lean: () => Promise.resolve({ _id: ENCOUNTER_ID, attendingDoctorId: DOCTOR_ID }) });
    mockUserFindOne.mockReturnValue({ lean: () => Promise.resolve({ _id: REVIEWER_ID }) });
    mockPRFindOne.mockReturnValue({ lean: () => Promise.resolve(null) });
    mockPRCreate.mockResolvedValue({ _id: new Types.ObjectId(), status: 'pending' });

    const res = await request(adminApp).post('/').send({ encounterId: ENCOUNTER_ID, reviewerId: REVIEWER_ID });
    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('pending');
  });

  it('returns 400 when reviewer === reviewee (self-review prevention)', async () => {
    mockEncFindOne.mockReturnValue({ lean: () => Promise.resolve({ _id: ENCOUNTER_ID, attendingDoctorId: REVIEWER_ID }) });
    mockUserFindOne.mockReturnValue({ lean: () => Promise.resolve({ _id: REVIEWER_ID }) });
    mockPRFindOne.mockReturnValue({ lean: () => Promise.resolve(null) });

    const res = await request(adminApp).post('/').send({ encounterId: ENCOUNTER_ID, reviewerId: REVIEWER_ID });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/same person/);
  });

  it('returns 409 when encounter already has a review', async () => {
    mockEncFindOne.mockReturnValue({ lean: () => Promise.resolve({ _id: ENCOUNTER_ID, attendingDoctorId: DOCTOR_ID }) });
    mockUserFindOne.mockReturnValue({ lean: () => Promise.resolve({ _id: REVIEWER_ID }) });
    mockPRFindOne.mockReturnValue({ lean: () => Promise.resolve({ _id: 'existing' }) });

    const res = await request(adminApp).post('/').send({ encounterId: ENCOUNTER_ID, reviewerId: REVIEWER_ID });
    expect(res.status).toBe(409);
  });

  it('returns 400 when required fields are missing', async () => {
    const res = await request(adminApp).post('/').send({});
    expect(res.status).toBe(400);
  });
});

// ── Submission ────────────────────────────────────────────────────────────────

describe('PUT /:id — submit review', () => {
  const reviewId = new Types.ObjectId().toHexString();

  it('submits a review and marks it completed', async () => {
    const mockReview: any = {
      _id: reviewId,
      reviewerId: REVIEWER_ID,
      revieweeId: DOCTOR_ID,
      clinicId: CLINIC_ID,
      status: 'pending',
      isAnonymous: false,
      save: jest.fn().mockResolvedValue(undefined),
    };
    mockPRFindOne.mockResolvedValue(mockReview);
    mockUserFindById.mockReturnValue({ lean: () => Promise.resolve({ fullName: 'Dr Reviewer' }) });

    const res = await request(reviewerApp)
      .put(`/${reviewId}`)
      .send({ rating: 4, feedback: 'Good documentation', categories: { documentation: 4, diagnosis: 4, treatment: 4, followUp: 3 } });

    expect(res.status).toBe(200);
    expect(mockReview.status).toBe('completed');
    expect(mockReview.rating).toBe(4);
    expect(mockReview.save).toHaveBeenCalled();
    expect(createNotification).toHaveBeenCalledWith(
      expect.objectContaining({ userId: DOCTOR_ID, type: 'system' })
    );
  });

  it('returns 400 for invalid rating (> 5)', async () => {
    const res = await request(reviewerApp).put(`/${reviewId}`).send({ rating: 6 });
    expect(res.status).toBe(400);
  });

  it('returns 409 when review already completed', async () => {
    mockPRFindOne.mockResolvedValue({ status: 'completed', save: jest.fn() });
    const res = await request(reviewerApp).put(`/${reviewId}`).send({ rating: 3 });
    expect(res.status).toBe(409);
  });
});

// ── Anonymous review ──────────────────────────────────────────────────────────

describe('Anonymous review', () => {
  const reviewId = new Types.ObjectId().toHexString();

  it('hides reviewer name in notification when isAnonymous=true', async () => {
    const mockReview: any = {
      _id: reviewId,
      reviewerId: REVIEWER_ID,
      revieweeId: DOCTOR_ID,
      clinicId: CLINIC_ID,
      status: 'pending',
      isAnonymous: true,
      save: jest.fn().mockResolvedValue(undefined),
    };
    mockPRFindOne.mockResolvedValue(mockReview);

    const res = await request(reviewerApp)
      .put(`/${reviewId}`)
      .send({ rating: 5, feedback: 'Excellent' });

    expect(res.status).toBe(200);
    expect(createNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining('anonymous reviewer'),
      })
    );
    // Reviewer identity should not be looked up
    expect(mockUserFindById).not.toHaveBeenCalled();
  });
});

// ── Review queue ──────────────────────────────────────────────────────────────

describe('GET /assigned — review queue', () => {
  it('returns reviews assigned to the current user', async () => {
    const chain = { lean: jest.fn().mockResolvedValue([{ _id: 'r1' }]) };
    const sortChain = { sort: jest.fn().mockReturnValue(chain) };
    const pop2 = { populate: jest.fn().mockReturnValue(sortChain) };
    const pop1 = { populate: jest.fn().mockReturnValue(pop2) };
    mockPRFind.mockReturnValue(pop1);

    const res = await request(reviewerApp).get('/assigned');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });
});
