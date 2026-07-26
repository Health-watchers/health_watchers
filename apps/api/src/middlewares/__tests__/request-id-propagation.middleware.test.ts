import { Request, Response, NextFunction } from 'express';
import { requestIdPropagationMiddleware } from '../request-id-propagation.middleware';
import { getRequestId } from '../../utils/request-id';

function mockReq(overrides: Partial<Record<string, unknown>> = {}): Request {
  return {
    headers: {},
    ...overrides,
  } as unknown as Request;
}

function mockRes(): Response {
  const res = {
    setHeader: jest.fn(),
  } as unknown as Response;
  return res;
}

const noop = jest.fn() as unknown as NextFunction;

describe('requestIdPropagationMiddleware', () => {
  beforeEach(() => jest.clearAllMocks());

  it('stores the requestId from req.id into AsyncLocalStorage', (done) => {
    const req = mockReq({ id: 'async-id-1', headers: {} }) as any;
    const res = mockRes();

    const next: NextFunction = () => {
      expect(getRequestId()).toBe('async-id-1');
      done();
    };

    requestIdPropagationMiddleware(req, res, next);
  });

  it('stores the requestId from x-request-id header when req.id is absent', (done) => {
    const req = mockReq({ headers: { 'x-request-id': 'header-id-99' } }) as any;
    const res = mockRes();

    const next: NextFunction = () => {
      expect(getRequestId()).toBe('header-id-99');
      done();
    };

    requestIdPropagationMiddleware(req, res, next);
  });

  it('sets the X-Request-ID response header', (done) => {
    const req = mockReq({ id: 'resp-header-id', headers: {} }) as any;
    const res = mockRes();

    const next: NextFunction = () => {
      expect(res.setHeader).toHaveBeenCalledWith('x-request-id', 'resp-header-id');
      done();
    };

    requestIdPropagationMiddleware(req, res, next);
  });

  it('calls next()', () => {
    const req = mockReq({ id: 'call-next-id', headers: {} }) as any;
    const res = mockRes();
    requestIdPropagationMiddleware(req, res, noop);
    expect(noop).toHaveBeenCalledTimes(1);
  });

  it('does not set response header when no requestId is resolvable', () => {
    // req.id absent, no x-request-id header → extractRequestId returns ''
    const req = mockReq({ headers: {} }) as any;
    const res = mockRes();
    requestIdPropagationMiddleware(req, res, noop);
    expect(res.setHeader).not.toHaveBeenCalled();
  });

  it('prefers req.id over x-request-id header', (done) => {
    const req = mockReq({
      id: 'from-req-id',
      headers: { 'x-request-id': 'from-header' },
    }) as any;
    const res = mockRes();

    const next: NextFunction = () => {
      // extractRequestId checks req.id first
      expect(getRequestId()).toBe('from-req-id');
      done();
    };

    requestIdPropagationMiddleware(req, res, next);
  });
});
