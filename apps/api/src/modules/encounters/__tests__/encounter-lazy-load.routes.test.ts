/**
 * Integration tests for encounter lazy-load routes — Issue #1427
 *
 * Routes under test:
 *   GET /api/v1/encounters/:encounterId/relation/:relation
 *   GET /api/v1/encounters/:encounterId/relations
 *
 * Uses an isolated Express app (no app.ts import) to avoid the
 * @health-watchers/types transitive dependency absent in CI.
 */

// ── Environment stubs ─────────────────────────────────────────────────────────
process.env.JWT_ACCESS_TOKEN_SECRET = 'test-access-secret-32-chars-long!!';
process.env.JWT_REFRESH_TOKEN_SECRET = 'test-refresh-secret-32-chars-long!';

// ── Mocks ─────────────────────────────────────────────────────────────────────
jest.mock('@api/utils/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

jest.mock('@api/services/token-denylist.service', () => ({
  isDenylisted: jest.fn().mockResolvedValue(false),
  isInvalidatedForUser: jest.fn().mockResolvedValue(false),
}));

jest.mock('@health-watchers/config', () => ({
  config: {
    jwt: {
      accessTokenSecret: 'test-access-secret-32-chars-long!!',
      refreshTokenSecret: 'test-refresh-secret-32-chars-long!',
      issuer: 'health-watchers-api',
      audience: 'health-watchers-client',
    },
    fieldEncryptionKey: 'abcdefghijklmnopqrstuvwxyz012345',
  },
}));

// Stub lazy-load controller
const mockGetEncounterRelation = jest.fn(async (_req: any, res: any) => {
  res.json({ success: true, data: { id: 'rel-1' } });
});
const mockGetMultipleEncounterRelations = jest.fn(async (_req: any, res: any) => {
  res.json({ success: true, data: { attendingDoctorId: {}, patientId: {} } });
});

jest.mock('../encounter-lazy-load.controller', () => ({
  getEncounterRelation: mockGetEncounterRelation,
  getMultipleEncounterRelations: mockGetMultipleEncounterRelations,
}));

// ── Imports ───────────────────────────────────────────────────────────────────
import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';

const SECRET = 'test-access-secret-32-chars-long!!';
const CLINIC_ID = '507f1f77bcf86cd799439011';
const USER_ID = '507f1f77bcf86cd799439022';
const ENCOUNTER_ID = '507f1f77bcf86cd799439033';

function makeToken(role = 'DOCTOR') {
  return jwt.sign(
    { userId: USER_ID, role, clinicId: CLINIC_ID, jti: `jti-${Date.now()}-${Math.random()}` },
    SECRET,
    { expiresIn: '15m', issuer: 'health-watchers-api', audience: 'health-watchers-client' }
  );
}

function buildApp() {
  const app = express();
  app.use(express.json());
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const encounterLazyLoadRouter = require('../encounter-lazy-load.routes').default;
  app.use('/api/v1/encounters', encounterLazyLoadRouter);
  return app;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('GET /api/v1/encounters/:encounterId/relation/:relation', () => {
  let app: express.Application;
  beforeAll(() => { app = buildApp(); });
  beforeEach(() => jest.clearAllMocks());

  it('returns 200 for an authenticated DOCTOR', async () => {
    const res = await request(app)
      .get(`/api/v1/encounters/${ENCOUNTER_ID}/relation/attendingDoctorId`)
      .set('Authorization', `Bearer ${makeToken('DOCTOR')}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(mockGetEncounterRelation).toHaveBeenCalledTimes(1);
  });

  it('returns 200 for an authenticated CLINIC_ADMIN', async () => {
    const res = await request(app)
      .get(`/api/v1/encounters/${ENCOUNTER_ID}/relation/patientId`)
      .set('Authorization', `Bearer ${makeToken('CLINIC_ADMIN')}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('returns 401 when no Authorization header is provided', async () => {
    const res = await request(app)
      .get(`/api/v1/encounters/${ENCOUNTER_ID}/relation/attendingDoctorId`);

    expect(res.status).toBe(401);
    expect(mockGetEncounterRelation).not.toHaveBeenCalled();
  });

  it('returns 401 for an expired token', async () => {
    const expired = jwt.sign(
      { userId: USER_ID, role: 'DOCTOR', clinicId: CLINIC_ID, jti: 'exp' },
      SECRET,
      { expiresIn: '-1s', issuer: 'health-watchers-api', audience: 'health-watchers-client' }
    );
    const res = await request(app)
      .get(`/api/v1/encounters/${ENCOUNTER_ID}/relation/attendingDoctorId`)
      .set('Authorization', `Bearer ${expired}`);

    expect(res.status).toBe(401);
    expect(mockGetEncounterRelation).not.toHaveBeenCalled();
  });

  it('passes route params to the controller', async () => {
    await request(app)
      .get(`/api/v1/encounters/${ENCOUNTER_ID}/relation/diagnosisCodes`)
      .set('Authorization', `Bearer ${makeToken('DOCTOR')}`);

    expect(mockGetEncounterRelation).toHaveBeenCalledTimes(1);
    const [req] = mockGetEncounterRelation.mock.calls[0];
    expect(req.params.relation).toBe('diagnosisCodes');
    expect(req.params.encounterId).toBe(ENCOUNTER_ID);
  });
});

describe('GET /api/v1/encounters/:encounterId/relations', () => {
  let app: express.Application;
  beforeAll(() => { app = buildApp(); });
  beforeEach(() => jest.clearAllMocks());

  it('returns 200 for an authenticated DOCTOR', async () => {
    const res = await request(app)
      .get(`/api/v1/encounters/${ENCOUNTER_ID}/relations`)
      .set('Authorization', `Bearer ${makeToken('DOCTOR')}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(mockGetMultipleEncounterRelations).toHaveBeenCalledTimes(1);
  });

  it('returns 401 when no token is provided', async () => {
    const res = await request(app)
      .get(`/api/v1/encounters/${ENCOUNTER_ID}/relations`);

    expect(res.status).toBe(401);
    expect(mockGetMultipleEncounterRelations).not.toHaveBeenCalled();
  });
});
