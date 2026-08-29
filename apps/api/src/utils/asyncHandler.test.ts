/**
 * Unit tests for asyncHandler.ts
 */
import { asyncHandler } from './asyncHandler';
import type { Request, Response, NextFunction } from 'express';

function createMocks() {
  const req = {} as Request;
  const res = {} as Response;
  const next = jest.fn() as jest.MockedFunction<NextFunction>;
  return { req, res, next };
}

describe('asyncHandler', () => {
  it('calls next() with the error when the handler rejects', async () => {
    const { req, res, next } = createMocks();
    const boom = new Error('boom');
    const handler = async () => {
      throw boom;
    };
    const wrapped = asyncHandler(handler);
    // Await so the promise chain (.catch(next)) flushes before asserting
    await wrapped(req, res, next);
    expect(next).toHaveBeenCalledWith(boom);
  });

  it('does not call next() when the handler resolves', async () => {
    const { req, res, next } = createMocks();
    const handler = jest.fn().mockResolvedValue(undefined);
    const wrapped = asyncHandler(handler);
    await wrapped(req, res, next);
    expect(handler).toHaveBeenCalledWith(req, res, next);
    expect(next).not.toHaveBeenCalled();
  });

  it('passes through the returned value for a resolved promise', async () => {
    const { req, res, next } = createMocks();
    const handler = jest.fn().mockResolvedValue('ok');
    const wrapped = asyncHandler(handler);
    await expect(wrapped(req, res, next)).resolves.toBe('ok');
  });

  it('propagates rejected non-Error values to next', async () => {
    const { req, res, next } = createMocks();
    const handler = async () => {
      throw 'string-error';
    };
    const wrapped = asyncHandler(handler);
    // Await so the promise chain (.catch(next)) flushes before asserting
    await wrapped(req, res, next);
    expect(next).toHaveBeenCalledWith('string-error');
  });
});
