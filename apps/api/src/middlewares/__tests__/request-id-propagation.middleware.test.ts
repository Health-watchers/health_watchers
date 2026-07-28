import { Request, Response } from 'express';
import { requestIdPropagationMiddleware } from '../request-id-propagation.middleware';
import { setRequestId, extractRequestId } from '@api/utils/request-id';

jest.mock('@api/utils/request-id', () => ({
  setRequestId: jest.fn(),
  extractRequestId: jest.fn(),
}));

function mockRes() {
  const res: Partial<Response> = { setHeader: jest.fn() };
  return res as Response;
}

describe('requestIdPropagationMiddleware', () => {
  afterEach(() => jest.clearAllMocks());

  it('stores and echoes the request id when one is extracted', () => {
    (extractRequestId as jest.Mock).mockReturnValue('req-xyz');
    const req = {} as Request;
    const res = mockRes();
    const next = jest.fn();

    requestIdPropagationMiddleware(req, res, next);

    expect(setRequestId).toHaveBeenCalledWith('req-xyz');
    expect(res.setHeader).toHaveBeenCalledWith('x-request-id', 'req-xyz');
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('does nothing beyond calling next when there is no request id', () => {
    (extractRequestId as jest.Mock).mockReturnValue('');
    const req = {} as Request;
    const res = mockRes();
    const next = jest.fn();

    requestIdPropagationMiddleware(req, res, next);

    expect(setRequestId).not.toHaveBeenCalled();
    expect(res.setHeader).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledTimes(1);
  });
});
