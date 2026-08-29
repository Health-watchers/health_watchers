import { Request, Response, NextFunction } from 'express';
import { asyncHandler } from './asyncHandler';

describe('asyncHandler', () => {
  it('invokes the wrapped handler with req, res and next', async () => {
    const fn = jest.fn().mockResolvedValue(undefined);
    const req = {} as Request;
    const res = {} as Response;
    const next = jest.fn() as NextFunction;

    await asyncHandler(fn)(req, res, next);

    expect(fn).toHaveBeenCalledWith(req, res, next);
    expect(next).not.toHaveBeenCalled();
  });

  it('forwards a rejected promise to next', async () => {
    const error = new Error('boom');
    const fn = jest.fn().mockRejectedValue(error);
    const req = {} as Request;
    const res = {} as Response;
    const next = jest.fn() as NextFunction;

    await asyncHandler(fn)(req, res, next);
    // allow the internal .catch(next) microtask to run
    await Promise.resolve();

    expect(next).toHaveBeenCalledWith(error);
  });
});
