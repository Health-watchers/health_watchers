import { Request, Response } from 'express';
import { traceIdHeader } from '../trace-id.middleware';
import { currentTraceId } from '../../utils/tracer';

jest.mock('../../utils/tracer', () => ({ currentTraceId: jest.fn() }));

function mockRes() {
  const res: Partial<Response> = { setHeader: jest.fn(), on: jest.fn() };
  return res as Response;
}

describe('traceIdHeader', () => {
  afterEach(() => jest.clearAllMocks());

  it('sets X-Trace-Id when there is an active trace', () => {
    (currentTraceId as jest.Mock).mockReturnValue('trace-123');
    const req = {} as Request;
    const res = mockRes();
    const next = jest.fn();

    traceIdHeader(req, res, next);

    expect(res.setHeader).toHaveBeenCalledWith('X-Trace-Id', 'trace-123');
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('does not set the header when there is no active trace', () => {
    (currentTraceId as jest.Mock).mockReturnValue(undefined);
    const req = {} as Request;
    const res = mockRes();
    const next = jest.fn();

    traceIdHeader(req, res, next);

    expect(res.setHeader).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledTimes(1);
  });
});
