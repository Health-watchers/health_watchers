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

  it('allows GET requests without CSRF token', () => {
    const req = makeReq({ method: 'GET', cookies: { 'csrf-token': 'abc' } });
    const res = makeRes();
    csrfMiddleware(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

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
});
