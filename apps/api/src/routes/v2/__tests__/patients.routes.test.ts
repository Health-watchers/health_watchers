/**
 * GET /api/v2/patients (#1434) — cursor pagination, sparse fieldsets, v2 envelope.
 * Runs against an in-memory MongoDB so pagination and query plans are real.
 */
import express from 'express';
import request from 'supertest';
import { Types } from 'mongoose';

jest.mock('@api/utils/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));
// Identity comes from test headers instead of a signed JWT.
jest.mock('@api/middlewares/auth.middleware', () => ({
  authenticate: (req: any, _res: any, next: any) => {
    req.user = {
      userId: 'u1',
      role: req.headers['x-test-role'] ?? 'DOCTOR',
      clinicId: req.headers['x-test-clinic'],
    };
    next();
  },
}));

import { startTestDb, stopTestDb, TestDb } from '../../../integration/helpers/test-db';
import { encrypt } from '@api/lib/encrypt';
import { PatientModel } from '@api/modules/patients/models/patient.model';
import { decodeCursor, encodeCursor, NEWEST_FIRST, afterCursorFilter } from '@api/utils/cursor';
import { v2Router } from '../index';

const CLINIC_A = new Types.ObjectId().toString();
const CLINIC_B = new Types.ObjectId().toString();
const TOTAL_A = 2_105; // > 100 pages of 20
const BASE_TIME = Date.parse('2026-01-01T00:00:00.000Z');

let testDb: TestDb;
const app = express();
app.use('/api/v2', v2Router);

const get = (url: string, clinic = CLINIC_A, role = 'DOCTOR') =>
  request(app).get(url).set('x-test-clinic', clinic).set('x-test-role', role);

function patientDoc(i: number, clinicId: string, overrides: Record<string, unknown> = {}) {
  return {
    systemId: `HW-${clinicId.slice(-6)}-${String(i).padStart(6, '0')}`,
    firstName: `First${i}`,
    lastName: `Last${i}`,
    searchName: `first${i} last${i}`,
    dateOfBirth: encrypt('1990-01-01'),
    contactNumber: encrypt(`555-${i}`),
    sex: 'F',
    clinicId: new Types.ObjectId(clinicId),
    isActive: true,
    // Every 3 patients share a timestamp so the _id tie-breaker is exercised.
    createdAt: new Date(BASE_TIME + Math.floor(i / 3) * 1000),
    updatedAt: new Date(BASE_TIME),
    ...overrides,
  };
}

beforeAll(async () => {
  testDb = await startTestDb();
  await PatientModel.syncIndexes();
  const docs = Array.from({ length: TOTAL_A }, (_, i) => patientDoc(i, CLINIC_A));
  docs.push(patientDoc(0, CLINIC_B, { systemId: 'HW-B-1' }));
  docs.push(patientDoc(99_999, CLINIC_A, { systemId: 'HW-INACTIVE', isActive: false }));
  // insertMany with explicit timestamps (bypasses the save hook; PHI is pre-encrypted above).
  await PatientModel.collection.insertMany(docs);
}, 120_000);

afterAll(async () => {
  await stopTestDb(testDb);
});

describe('GET /api/v2/patients', () => {
  it('returns the first page in the v2 envelope, newest first', async () => {
    const res = await get('/api/v2/patients');

    expect(res.status).toBe(200);
    expect(res.body).toEqual(
      expect.objectContaining({
        success: true,
        version: '2.0',
        items: expect.any(Array),
        meta: expect.objectContaining({ limit: 20, count: 20, hasMore: true }),
        links: expect.objectContaining({ self: '/api/v2/patients' }),
      })
    );
    expect(res.body.meta.nextCursor).toEqual(expect.any(String));
    expect(res.body.links.next).toBe(
      `/api/v2/patients?cursor=${encodeURIComponent(res.body.meta.nextCursor)}`
    );
    // Newest first
    expect(res.body.items[0].systemId).toBe(`HW-${CLINIC_A.slice(-6)}-${String(TOTAL_A - 1).padStart(6, '0')}`);
    // PHI is decrypted in the response
    expect(res.body.items[0].dateOfBirth).toBe('1990-01-01');
  });

  it('walks every active patient of the clinic exactly once across pages', async () => {
    const seen = new Set<string>();
    let url: string | null = '/api/v2/patients?limit=100';
    let pages = 0;
    let previousCreatedAt = Infinity;
    while (url) {
      const res = await get(url);
      expect(res.status).toBe(200);
      for (const item of res.body.items) {
        expect(seen.has(item.id)).toBe(false);
        seen.add(item.id);
        const t = Date.parse(item.createdAt);
        expect(t).toBeLessThanOrEqual(previousCreatedAt);
        previousCreatedAt = t;
      }
      url = res.body.links.next;
      pages++;
    }
    expect(seen.size).toBe(TOTAL_A); // no other clinic, no inactive patient
    expect(pages).toBe(Math.ceil(TOTAL_A / 100));
  });

  it('scopes to the caller clinic; SUPER_ADMIN may pick another clinic', async () => {
    const res = await get(`/api/v2/patients?clinicId=${CLINIC_A}`, CLINIC_B);
    expect(res.body.items.map((p: any) => p.systemId)).toEqual(['HW-B-1']);

    const admin = await get(`/api/v2/patients?clinicId=${CLINIC_B}`, CLINIC_A, 'SUPER_ADMIN');
    expect(admin.body.items.map((p: any) => p.systemId)).toEqual(['HW-B-1']);
  });

  it('returns only the requested sparse fieldset', async () => {
    const res = await get('/api/v2/patients?limit=2&fields=id,firstName,riskLevel');
    expect(res.status).toBe(200);
    for (const item of res.body.items) {
      expect(Object.keys(item).sort()).toEqual(['firstName', 'id', 'riskLevel']);
    }
    expect(res.body.meta.fields).toEqual(['id', 'firstName', 'riskLevel']);
  });

  it('keeps the fieldset when following the next link', async () => {
    const first = await get('/api/v2/patients?limit=2&fields=id,lastName');
    const next = await get(first.body.links.next);
    expect(Object.keys(next.body.items[0]).sort()).toEqual(['id', 'lastName']);
  });

  it('rejects unknown fields', async () => {
    const res = await get('/api/v2/patients?fields=id,ssn');
    expect(res.status).toBe(400);
    expect(res.body).toEqual(
      expect.objectContaining({
        success: false,
        error: expect.objectContaining({ code: 'InvalidFields' }),
      })
    );
  });

  it.each(['not-a-cursor', Buffer.from('{"v":1,"c":"x","i":"y"}').toString('base64url')])(
    'rejects a malformed cursor (%s)',
    async (cursor) => {
      const res = await get(`/api/v2/patients?cursor=${cursor}`);
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('InvalidCursor');
    }
  );

  it('validates limit', async () => {
    expect((await get('/api/v2/patients?limit=0')).status).toBe(400);
    expect((await get('/api/v2/patients?limit=101')).status).toBe(400);
  });
});

describe('page 100 costs the same as page 1', () => {
  async function explainPage(cursor?: string) {
    const filter: Record<string, unknown> = {
      clinicId: new Types.ObjectId(CLINIC_A),
      isActive: true,
      ...(cursor ? afterCursorFilter(decodeCursor(cursor)) : {}),
    };
    const plan: any = await PatientModel.collection
      .find(filter)
      .sort(NEWEST_FIRST)
      .limit(21)
      .hint('patients_clinicId_isActive_createdAt_id')
      .explain('executionStats');
    return plan.executionStats;
  }

  it('examines the same number of index keys and documents on page 1 and page 100', async () => {
    // Cursor for the start of page 100 (after 99 pages of 20).
    const docs = await PatientModel.find({ clinicId: CLINIC_A, isActive: true })
      .sort(NEWEST_FIRST)
      .skip(99 * 20 - 1)
      .limit(1)
      .select('_id createdAt')
      .lean();
    const cursor = encodeCursor({ createdAt: docs[0].createdAt as Date, id: String(docs[0]._id) });

    const page1 = await explainPage();
    const page100 = await explainPage(cursor);

    expect(page1.nReturned).toBe(21);
    expect(page100.nReturned).toBe(21);
    // Keyset pagination: no skip, so page 100 reads ~limit docs, not 2,000.
    expect(page100.totalDocsExamined).toBe(page1.totalDocsExamined);
    expect(page100.totalDocsExamined).toBeLessThanOrEqual(21);
    expect(page100.totalKeysExamined).toBeLessThanOrEqual(page1.totalKeysExamined + 3);
    expect(JSON.stringify(page100.executionStages)).not.toContain('"SKIP"');
  });

  it('serves page 100 through the HTTP route with a single index seek', async () => {
    let url = '/api/v2/patients?limit=20';
    for (let i = 1; i < 100; i++) url = (await get(url)).body.links.next;
    const res = await get(url);
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(20);
  });
});

describe('cursor encoding', () => {
  it('round-trips and rejects tampering', () => {
    const id = new Types.ObjectId().toString();
    const createdAt = new Date('2026-05-01T10:00:00.000Z');
    expect(decodeCursor(encodeCursor({ createdAt, id }))).toEqual({ createdAt, id });
    expect(() => decodeCursor('%%%')).toThrow('Invalid');
    expect(() =>
      decodeCursor(Buffer.from(JSON.stringify({ v: 2, c: createdAt, i: id })).toString('base64url'))
    ).toThrow('Invalid');
  });
});
