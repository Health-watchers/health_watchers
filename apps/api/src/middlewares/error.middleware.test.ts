import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import express, { type Express, type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';

import { AppError } from '../errors/AppError';
import { asyncHandler } from '../utils/asyncHandler';
import { errorHandler } from './error.middleware';

/**
 * Integration tests verifying that every error response emitted by the API
 * conforms to the standard error shape:
 *
 *   { error: string, code: string, message: string, requestId: string, details?: unknown }
 *
 * The tests mount representative routes (validation error, auth error,
 * not-found, rate-limited, internal error) on a throwaway Express app that
 * uses the same central error handler as the real application.
 */

interface StandardErrorShape {
  error: string;
  code: string;
  message: string;
  requestId: string;
  details?: unknown;
}

const STANDARD_KEYS = ['error', 'code', 'message', 'requestId'];

function expectStandardErrorShape(body: unknown): asserts body is StandardErrorShape {
  expect(body).toBeTypeOf('object');
  expect(body).not.toBeNull();

  const payload = body as Record<string, unknown>;

  for (const key of STANDARD_KEYS) {
    expect(payload).toHaveProperty(key);
    expect(payload[key]).toBeTypeOf('string');
    expect((payload[key] as string).length).toBeGreaterThan(0);
  }

  // `error` should be a short machine-friendly label, `message` human readable.
  expect(payload.error).not.toBe(payload.message);

  // No unexpected top-level keys beyond the standard shape (+ optional details).
  const allowedKeys = new Set([...STANDARD_KEYS, 'details']);
  for (const key of Object.keys(payload)) {
    expect(allowedKeys.has(key)).toBe(true);
  }

  if ('details' in payload) {
    expect(payload.details).toBeDefined();
  }
}

describe('error handling integration', () => {
  let app: Express;

  beforeAll(() => {
    app = express();
    app.use(express.json());

    // Simulate request-id middleware that the real app installs.
    app.use((req: Request, _res: Response, next: NextFunction) => {
      (req as Request & { requestId?: string }).requestId =
        (req.headers['x-request-id'] as string | undefined) ?? 'test-request-id';
      next();
    });

    // Validation error (e.g. zod / express-validator failure).
    app.post(
      '/validation',
      asyncHandler(async (req: Request) => {
        if (!req.body?.email) {
          throw new AppError({
            statusCode: 400,
            code: 'VALIDATION_ERROR',
            message: 'Invalid request payload',
            details: [{ field: 'email', message: 'email is required' }],
          });
        }
      }),
    );

    // Authentication error.
    app.get(
      '/auth',
      asyncHandler(async () => {
        throw new AppError({
          statusCode: 401,
          code: 'UNAUTHORIZED',
          message: 'Authentication required',
        });
      }),
    );

    // Not-found error thrown from a handler.
    app.get(
      '/missing',
      asyncHandler(async () => {
        throw new AppError({
          statusCode: 404,
          code: 'NOT_FOUND',
          message: 'Resource not found',
        });
      }),
    );

    // Rate-limited error.
    app.get(
      '/rate-limited',
      asyncHandler(async () => {
        throw new AppError({
          statusCode: 429,
          code: 'RATE_LIMITED',
          message: 'Too many requests',
          details: { retryAfter: 60 },
        });
      }),
    );

    // Internal error: a plain Error thrown from an async handler.
    app.get(
      '/internal',
      asyncHandler(async () => {
        throw new Error('Something exploded');
      }),
    );

    // Unknown route -> 404 handled by the central error handler.
    app.use((req: Request, _res: Response, next: NextFunction) => {
      next(
        new AppError({
          statusCode: 404,
          code: 'NOT_FOUND',
          message: `Route ${req.method} ${req.path} not found`,
        }),
      );
    });

    app.use(errorHandler);
  });

  afterAll(() => {
    vi.restoreAllMocks();
  });

  it('returns the standard shape for validation errors', async () => {
    const res = await request(app).post('/validation').send({});

    expect(res.status).toBe(400);
    expectStandardErrorShape(res.body);
    expect(res.body.code).toBe('VALIDATION_ERROR');
    expect(res.body.details).toBeDefined();
  });

  it('returns the standard shape for authentication errors', async () => {
    const res = await request(app).get('/auth');

    expect(res.status).toBe(401);
    expectStandardErrorShape(res.body);
    expect(res.body.code).toBe('UNAUTHORIZED');
  });

  it('returns the standard shape for not-found errors', async () => {
    const res = await request(app).get('/missing');

    expect(res.status).toBe(404);
    expectStandardErrorShape(res.body);
    expect(res.body.code).toBe('NOT_FOUND');
  });

  it('returns the standard shape for unknown routes', async () => {
    const res = await request(app).get('/does-not-exist');

    expect(res.status).toBe(404);
    expectStandardErrorShape(res.body);
    expect(res.body.code).toBe('NOT_FOUND');
  });

  it('returns the standard shape for rate-limited errors', async () => {
    const res = await request(app).get('/rate-limited');

    expect(res.status).toBe(429);
    expectStandardErrorShape(res.body);
    expect(res.body.code).toBe('RATE_LIMITED');
    expect(res.body.details).toBeDefined();
  });

  it('returns the standard shape for internal errors without leaking details', async () => {
    const res = await request(app).get('/internal');

    expect(res.status).toBe(500);
    expectStandardErrorShape(res.body);
    expect(res.body.code).toBe('INTERNAL_SERVER_ERROR');
    expect(res.body.message).not.toContain('Something exploded');
  });

  it('propagates the request id into the error response', async () => {
    const res = await request(app)
      .get('/auth')
      .set('x-request-id', 'abc-123');

    expect(res.status).toBe(401);
    expectStandardErrorShape(res.body);
    expect(res.body.requestId).toBe('abc-123');
  });

  it('always includes a requestId even when none was supplied', async () => {
    const res = await request(app).get('/missing');

    expectStandardErrorShape(res.body);
    expect(res.body.requestId).toBe('test-request-id');
  });
});