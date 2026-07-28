import { Request, Response, NextFunction } from 'express';
import { csrfMiddleware } from '../csrf.middleware';

function makeReq(overrides: Partial<Request> = {}): Request {
  return {
    method: 'POST',
    path: '/api/v1/patients',
    cookies: {},
    headers: {},
    ...overrides,
  } as unknown as Request;
}

function makeRes(): Response {
  const res = {
    cookie: jest.fn(),
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  } as unknown as Response;
  return res;
}

describe('csrfMiddleware', () => {
  const next = jest.fn() as unknown as NextFunction;
  beforeEach(() => jest.clearAllMocks());

  // ── Safe methods bypass ────────────────────────────────────────────────────

  it('allows GET requests without CSRF token', () => {
    const req = makeReq({ method: 'GET', cookies: { 'csrf-token': 'abc' } });
    const res = makeRes();
    csrfMiddleware(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('allows HEAD requests without CSRF token', () => {
    const req = makeReq({ method: 'HEAD', cookies: { 'csrf-token': 'abc' } });
    const res = makeRes();
    csrfMiddleware(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('allows OPTIONS requests without CSRF token', () => {
    const req = makeReq({ method: 'OPTIONS', cookies: { 'csrf-token': 'abc' } });
    const res = makeRes();
    csrfMiddleware(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  // ── Auth route bypass ──────────────────────────────────────────────────────

  it('bypasses CSRF check for /api/v1/auth/login', () => {
    const req = makeReq({
      method: 'POST',
      path: '/api/v1/auth/login',
      cookies: {},
      headers: {},
    });
    const res = makeRes();
    csrfMiddleware(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('bypasses CSRF check for /api/v1/auth/register', () => {
    const req = makeReq({
      method: 'POST',
      path: '/api/v1/auth/register',
      cookies: {},
      headers: {},
    });
    const res = makeRes();
    csrfMiddleware(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  // ── Token generation ───────────────────────────────────────────────────────

  it('generates and sets csrf-token cookie when none exists on GET', () => {
    const req = makeReq({ method: 'GET', cookies: {} });
    const res = makeRes();
    csrfMiddleware(req, res, next);
    expect(res.cookie).toHaveBeenCalledWith(
      'csrf-token',
      expect.stringMatching(/^[a-f0-9]{64}$/),
      expect.objectContaining({ httpOnly: false, sameSite: 'strict' })
    );
    expect(next).toHaveBeenCalled();
  });

  it('does not overwrite existing csrf-token cookie on GET', () => {
    const req = makeReq({ method: 'GET', cookies: { 'csrf-token': 'existing' } });
    const res = makeRes();
    csrfMiddleware(req, res, next);
    expect(res.cookie).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalled();
  });

  // ── Mutating method validation ─────────────────────────────────────────────

  it('rejects POST without X-CSRF-Token header (returns 403)', () => {
    const req = makeReq({
      method: 'POST',
      cookies: { 'csrf-token': 'valid-token' },
      headers: {},
    });
    const res = makeRes();
    csrfMiddleware(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects POST with mismatched X-CSRF-Token', () => {
    const req = makeReq({
      method: 'POST',
      cookies: { 'csrf-token': 'valid-token' },
      headers: { 'x-csrf-token': 'wrong-token' },
    });
    const res = makeRes();
    csrfMiddleware(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('allows POST with matching X-CSRF-Token', () => {
    const req = makeReq({
      method: 'POST',
      cookies: { 'csrf-token': 'valid-token' },
      headers: { 'x-csrf-token': 'valid-token' },
    });
    const res = makeRes();
    csrfMiddleware(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('rejects PUT without X-CSRF-Token header', () => {
    const req = makeReq({
      method: 'PUT',
      cookies: { 'csrf-token': 'tok' },
      headers: {},
    });
    const res = makeRes();
    csrfMiddleware(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('rejects DELETE without X-CSRF-Token header', () => {
    const req = makeReq({
      method: 'DELETE',
      cookies: { 'csrf-token': 'tok' },
      headers: {},
    });
    const res = makeRes();
    csrfMiddleware(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('rejects PATCH without X-CSRF-Token header', () => {
    const req = makeReq({
      method: 'PATCH',
      cookies: { 'csrf-token': 'tok' },
      headers: {},
    });
    const res = makeRes();
    csrfMiddleware(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('returns CSRF_TOKEN_INVALID error code on rejection', () => {
    const req = makeReq({
      method: 'POST',
      cookies: { 'csrf-token': 'tok' },
      headers: {},
    });
    const res = makeRes();
    csrfMiddleware(req, res, next);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'CSRF_TOKEN_INVALID' })
    );
  });
});
