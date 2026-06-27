import { Request, Response, NextFunction } from 'express';
import { errorHandler } from '../error.middleware';
import { AppError } from '../../utils/app-error';
import { ApiErrorCode } from '@health-watchers/types';
import { ZodError, z } from 'zod';

function mockRes() {
  const res = { status: jest.fn(), json: jest.fn(), locals: {} } as unknown as Response;
  (res.status as jest.Mock).mockReturnValue(res);
  return res;
}
const mockReq = { requestId: 'test-id', method: 'GET', path: '/', user: undefined } as unknown as Request;
const noop = jest.fn() as unknown as NextFunction;

describe('errorHandler', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns code from AppError', () => {
    const res = mockRes();
    const err = AppError.notFound('Patient');
    errorHandler(err, mockReq, res, noop);
    expect((res.json as jest.Mock).mock.calls[0][0]).toMatchObject({ code: ApiErrorCode.NOT_FOUND });
  });

  it('returns VALIDATION_ERROR code for ZodError', () => {
    const res = mockRes();
    const schema = z.object({ name: z.string() });
    let zodErr: ZodError | null = null;
    try { schema.parse({}); } catch (e) { zodErr = e as ZodError; }
    errorHandler(zodErr!, mockReq, res, noop);
    expect((res.json as jest.Mock).mock.calls[0][0]).toMatchObject({ code: ApiErrorCode.VALIDATION_ERROR });
  });

  it('returns INTERNAL_SERVER_ERROR for unknown errors', () => {
    const res = mockRes();
    errorHandler(new Error('oops'), mockReq, res, noop);
    expect((res.json as jest.Mock).mock.calls[0][0]).toMatchObject({ code: ApiErrorCode.INTERNAL_SERVER_ERROR });
  });
});
