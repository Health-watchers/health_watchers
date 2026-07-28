import { Request, Response } from 'express';
import { z } from 'zod';
import { validateRequest } from '../validate.middleware';

function mockRes() {
  const res: Partial<Response> = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res as Response;
}

describe('validateRequest', () => {
  it('rejects an invalid body with 400', () => {
    const req = { body: { name: 123 } } as unknown as Request;
    const res = mockRes();
    const next = jest.fn();

    validateRequest({ body: z.object({ name: z.string() }) })(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'ValidationError', message: 'Invalid request body' })
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('parses and replaces req.body on success', () => {
    const req = { body: { name: 'Alice', extra: 'stripped-if-schema-strict' } } as unknown as Request;
    const res = mockRes();
    const next = jest.fn();

    validateRequest({ body: z.object({ name: z.string() }) })(req, res, next);

    expect(req.body).toEqual({ name: 'Alice' });
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('rejects invalid params with 400', () => {
    const req = { params: { id: 'not-a-number' } } as unknown as Request;
    const res = mockRes();
    const next = jest.fn();

    validateRequest({ params: z.object({ id: z.string().regex(/^\d+$/) }) })(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Invalid request params' })
    );
  });

  it('rejects invalid query with 400', () => {
    const req = { query: { page: 'abc' } } as unknown as Request;
    const res = mockRes();
    const next = jest.fn();

    validateRequest({ query: z.object({ page: z.string().regex(/^\d+$/) }) })(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Invalid query parameters' })
    );
  });

  it('calls next once when body, params and query all validate', () => {
    const req = {
      body: { name: 'Bob' },
      params: { id: '42' },
      query: { page: '1' },
    } as unknown as Request;
    const res = mockRes();
    const next = jest.fn();

    validateRequest({
      body: z.object({ name: z.string() }),
      params: z.object({ id: z.string() }),
      query: z.object({ page: z.string() }),
    })(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });
});
