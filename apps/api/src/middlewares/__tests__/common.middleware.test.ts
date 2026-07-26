/**
 * Tests for common.middleware.ts (issue #929 — Extract Common Middleware)
 */

import { Request, Response } from 'express';
import { z } from 'zod';
import {
  isValidObjectId,
  validateObjectId,
  parsePaginationQuery,
  requireClinicMatch,
  requireResourceOwner,
  validateBody,
  validateQuery,
  OBJECT_ID_REGEX,
} from '../common.middleware';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const VALID_OBJECT_ID = '507f1f77bcf86cd799439011';
const INVALID_OBJECT_ID = 'not-a-valid-id';

function makeReq(overrides: Partial<Request> = {}): Request {
  return {
    params: {},
    query: {},
    body: {},
    user: undefined,
    ...overrides,
  } as unknown as Request;
}

function makeRes(): { res: Response; json: jest.Mock; status: jest.Mock; locals: Record<string, unknown> } {
  const locals: Record<string, unknown> = {};
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  const res = { json, status, locals } as unknown as Response;
  return { res, json, status, locals };
}

const next = jest.fn();
beforeEach(() => next.mockClear());

// ─── OBJECT_ID_REGEX ─────────────────────────────────────────────────────────

describe('OBJECT_ID_REGEX', () => {
  it('matches a valid 24-char hex string', () => {
    expect(OBJECT_ID_REGEX.test(VALID_OBJECT_ID)).toBe(true);
  });

  it('rejects an invalid id', () => {
    expect(OBJECT_ID_REGEX.test(INVALID_OBJECT_ID)).toBe(false);
    expect(OBJECT_ID_REGEX.test('')).toBe(false);
    expect(OBJECT_ID_REGEX.test('507f1f77bcf86cd79943901')).toBe(false); // 23 chars
  });
});

// ─── isValidObjectId ─────────────────────────────────────────────────────────

describe('isValidObjectId()', () => {
  it('returns true for valid ObjectId', () => {
    expect(isValidObjectId(VALID_OBJECT_ID)).toBe(true);
  });

  it('returns false for invalid string', () => {
    expect(isValidObjectId(INVALID_OBJECT_ID)).toBe(false);
  });
});

// ─── validateObjectId middleware ─────────────────────────────────────────────

describe('validateObjectId()', () => {
  it('calls next() when param is a valid ObjectId', () => {
    const req = makeReq({ params: { id: VALID_OBJECT_ID } });
    const { res } = makeRes();
    validateObjectId('id')(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it('returns 400 when param is missing', () => {
    const req = makeReq({ params: {} });
    const { res, status, json } = makeRes();
    validateObjectId('id')(req, res, next);
    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ error: 'BadRequest' }));
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 400 when param is invalid', () => {
    const req = makeReq({ params: { id: INVALID_OBJECT_ID } });
    const { res, status } = makeRes();
    validateObjectId('id')(req, res, next);
    expect(status).toHaveBeenCalledWith(400);
  });

  it('validates multiple params', () => {
    const req = makeReq({ params: { a: VALID_OBJECT_ID, b: INVALID_OBJECT_ID } });
    const { res, status } = makeRes();
    validateObjectId('a', 'b')(req, res, next);
    expect(status).toHaveBeenCalledWith(400);
    expect(next).not.toHaveBeenCalled();
  });

  it('defaults to "id" param', () => {
    const req = makeReq({ params: { id: VALID_OBJECT_ID } });
    const { res } = makeRes();
    validateObjectId()(req, res, next);
    expect(next).toHaveBeenCalled();
  });
});

// ─── parsePaginationQuery middleware ─────────────────────────────────────────

describe('parsePaginationQuery()', () => {
  it('sets default pagination in res.locals', () => {
    const req = makeReq({ query: {} });
    const { res, locals } = makeRes();
    parsePaginationQuery()(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(locals.pagination).toMatchObject({ page: 1, limit: 20 });
  });

  it('parses page and limit from query', () => {
    const req = makeReq({ query: { page: '2', limit: '50' } });
    const { res, locals } = makeRes();
    parsePaginationQuery()(req, res, next);
    expect(locals.pagination).toMatchObject({ page: 2, limit: 50 });
  });

  it('rejects limit > 100', () => {
    const req = makeReq({ query: { limit: '200' } });
    const { res, status } = makeRes();
    parsePaginationQuery()(req, res, next);
    expect(status).toHaveBeenCalledWith(400);
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects disallowed sort field', () => {
    const req = makeReq({ query: { sortBy: 'secret' } });
    const { res, status } = makeRes();
    parsePaginationQuery(['createdAt'])(req, res, next);
    expect(status).toHaveBeenCalledWith(400);
  });

  it('accepts allowed sort field', () => {
    const req = makeReq({ query: { sortBy: 'name', sortDir: 'asc' } });
    const { res, locals } = makeRes();
    parsePaginationQuery(['createdAt', 'name'])(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(locals.pagination).toMatchObject({ sort: { field: 'name', direction: 'asc' } });
  });
});

// ─── requireClinicMatch middleware ────────────────────────────────────────────

describe('requireClinicMatch()', () => {
  it('sets res.locals.filter to clinicId from JWT', () => {
    const req = makeReq({
      user: { userId: 'u1', clinicId: VALID_OBJECT_ID, role: 'DOCTOR', isSuperAdmin: false },
    });
    const { res, locals } = makeRes();
    requireClinicMatch()(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(locals.filter).toBeDefined();
  });

  it('returns 401 when no user on request', () => {
    const req = makeReq({ user: undefined });
    const { res, status } = makeRes();
    requireClinicMatch()(req, res, next);
    expect(status).toHaveBeenCalledWith(401);
  });

  it('allows SUPER_ADMIN with empty filter by default', () => {
    const req = makeReq({
      user: { userId: 'u2', clinicId: VALID_OBJECT_ID, role: 'SUPER_ADMIN', isSuperAdmin: true },
    });
    const { res, locals } = makeRes();
    requireClinicMatch()(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(locals.filter).toEqual({});
  });

  it('rejects when explicit paramName does not match caller clinicId', () => {
    const req = makeReq({
      params: { clinicId: '507f1f77bcf86cd799439099' },
      user: { userId: 'u3', clinicId: VALID_OBJECT_ID, role: 'CLINIC_ADMIN', isSuperAdmin: false },
    });
    const { res, status } = makeRes();
    requireClinicMatch({ paramName: 'clinicId' })(req, res, next);
    expect(status).toHaveBeenCalledWith(403);
  });

  it('passes when explicit paramName matches caller clinicId', () => {
    const req = makeReq({
      params: { clinicId: VALID_OBJECT_ID },
      user: { userId: 'u4', clinicId: VALID_OBJECT_ID, role: 'CLINIC_ADMIN', isSuperAdmin: false },
    });
    const { res } = makeRes();
    requireClinicMatch({ paramName: 'clinicId' })(req, res, next);
    expect(next).toHaveBeenCalled();
  });
});

// ─── requireResourceOwner middleware ─────────────────────────────────────────

describe('requireResourceOwner()', () => {
  it('allows when field matches user', () => {
    const req = makeReq({
      params: { patientId: VALID_OBJECT_ID },
      user: { userId: VALID_OBJECT_ID, clinicId: VALID_OBJECT_ID, role: 'PATIENT', isSuperAdmin: false, patientId: VALID_OBJECT_ID },
    });
    const { res } = makeRes();
    requireResourceOwner('params', 'patientId', 'patientId')(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it('rejects when field does not match user', () => {
    const req = makeReq({
      params: { patientId: '507f1f77bcf86cd799439099' },
      user: { userId: VALID_OBJECT_ID, clinicId: VALID_OBJECT_ID, role: 'PATIENT', isSuperAdmin: false, patientId: VALID_OBJECT_ID },
    });
    const { res, status } = makeRes();
    requireResourceOwner('params', 'patientId', 'patientId')(req, res, next);
    expect(status).toHaveBeenCalledWith(403);
  });

  it('bypasses check for SUPER_ADMIN', () => {
    const req = makeReq({
      params: { patientId: 'anything' },
      user: { userId: 'u', clinicId: VALID_OBJECT_ID, role: 'SUPER_ADMIN', isSuperAdmin: true },
    });
    const { res } = makeRes();
    requireResourceOwner('params', 'patientId', 'patientId')(req, res, next);
    expect(next).toHaveBeenCalled();
  });
});

// ─── validateBody middleware ──────────────────────────────────────────────────

describe('validateBody()', () => {
  const schema = z.object({ name: z.string().min(1) });

  it('passes valid body and assigns parsed data', () => {
    const req = makeReq({ body: { name: 'Alice', extra: 'stripped' } });
    const { res } = makeRes();
    validateBody(schema)(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(req.body).toEqual({ name: 'Alice' });
  });

  it('returns 400 for invalid body', () => {
    const req = makeReq({ body: { name: '' } });
    const { res, status } = makeRes();
    validateBody(schema)(req, res, next);
    expect(status).toHaveBeenCalledWith(400);
    expect(next).not.toHaveBeenCalled();
  });
});

// ─── validateQuery middleware ─────────────────────────────────────────────────

describe('validateQuery()', () => {
  const schema = z.object({ status: z.enum(['active', 'inactive']) });

  it('passes valid query', () => {
    const req = makeReq({ query: { status: 'active' } });
    const { res } = makeRes();
    validateQuery(schema)(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it('returns 400 for invalid query', () => {
    const req = makeReq({ query: { status: 'unknown' } });
    const { res, status } = makeRes();
    validateQuery(schema)(req, res, next);
    expect(status).toHaveBeenCalledWith(400);
  });
});
