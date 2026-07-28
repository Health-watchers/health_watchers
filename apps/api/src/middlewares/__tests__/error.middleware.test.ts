import { Request, Response } from 'express';
import { Error as MongooseError } from 'mongoose';
import { JsonWebTokenError, TokenExpiredError } from 'jsonwebtoken';
import { ZodError, z } from 'zod';
import { errorHandler, errorMiddleware } from '../error.middleware';

function mockRes() {
  const res: Partial<Response> = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res as Response;
}

function mockReq(requestId = 'req-1'): Request {
  return { requestId } as unknown as Request;
}

describe('errorHandler', () => {
  it('is exported under the errorMiddleware alias', () => {
    expect(errorMiddleware).toBe(errorHandler);
  });

  it('returns 400 for ZodError with field details', () => {
    const res = mockRes();
    const schema = z.object({ name: z.string() });
    const result = schema.safeParse({});
    const zodError = result.success ? undefined : result.error;

    errorHandler(zodError as ZodError, mockReq(), res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'ValidationError', requestId: 'req-1' })
    );
  });

  it('returns 400 for Mongoose ValidationError', () => {
    const res = mockRes();
    const err = new MongooseError.ValidationError();
    err.errors.name = new MongooseError.ValidatorError({ path: 'name', message: 'Path `name` is required.' });

    errorHandler(err, mockReq(), res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: 'ValidationError',
        details: [{ path: 'name', message: 'Path `name` is required.' }],
      })
    );
  });

  it('returns 400 for a CastError with the offending field', () => {
    const res = mockRes();
    const err = new MongooseError.CastError('ObjectId', 'abc', 'patientId');

    errorHandler(err, mockReq(), res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'BadRequest', message: 'Invalid value for field: patientId' })
    );
  });

  it('returns 409 for a duplicate key error', () => {
    const res = mockRes();
    const err = Object.assign(new Error('duplicate'), { code: 11000, keyValue: { email: 'a@b.com' } });

    errorHandler(err, mockReq(), res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'Conflict', field: 'email' })
    );
  });

  it('returns 401 for an expired JWT', () => {
    const res = mockRes();
    const err = new TokenExpiredError('jwt expired', new Date());

    errorHandler(err, mockReq(), res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: 'TokenExpired' }));
  });

  it('returns 401 for an invalid JWT', () => {
    const res = mockRes();
    const err = new JsonWebTokenError('invalid signature');

    errorHandler(err, mockReq(), res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: 'InvalidToken' }));
  });

  it('falls back to a 500 for unrecognized errors', () => {
    const res = mockRes();
    const err = new Error('boom');

    errorHandler(err, mockReq(), res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'InternalServerError', requestId: 'req-1' })
    );
  });
});
