import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import express, { type Express, type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// Mock the OpenTelemetry API so we can assert on span attributes without
// requiring a real tracer provider.
const spanAttributes: Record<string, unknown> = {};
const mockSpan = {
  setAttribute: vi.fn((key: string, value: unknown) => {
    spanAttributes[key] = value;
    return mockSpan;
  }),
  setAttributes: vi.fn((attrs: Record<string, unknown>) => {
    Object.assign(spanAttributes, attrs);
    return mockSpan;
  }),
  end: vi.fn(),
  recordException: vi.fn(),
  setStatus: vi.fn(),
  spanContext: vi.fn(() => ({
    traceId: 'trace-id-123',
    spanId: 'span-id-456',
    traceFlags: 1,
  })),
};

vi.mock('@opentelemetry/api', async () => {
  const actual = await vi.importActual<typeof import('@opentelemetry/api')>('@opentelemetry/api');
  return {
    ...actual,
    trace: {
      ...actual.trace,
      getActiveSpan: vi.fn(() => mockSpan),
      getSpan: vi.fn(() => mockSpan),
    },
  };
});

// Mock global fetch so outbound calls to stellar-service can be inspected.
const fetchMock = vi.fn();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const REQUEST_ID_HEADER = 'x-request-id';

/**
 * Builds a minimal Express app that wires up the request-id propagation
 * middleware under test, a route that performs an outbound call to the
 * stellar-service (using the shared HTTP client), and an error route.
 */
async function buildApp(): Promise<Express> {
  const { requestIdPropagation } = await import('./request-id-propagation');
  const { stellarServiceClient } = await import('../services/stellar-service-client');

  const app = express();
  app.use(express.json());
  app.use(requestIdPropagation);

  app.get('/health', (_req: Request, res: Response) => {
    res.status(200).json({ status: 'ok' });
  });

  app.get('/proxy', async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await stellarServiceClient.get('/accounts');
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  });

  app.get('/boom', (_req: Request, _res: Response, next: NextFunction) => {
    next(new Error('kaboom'));
  });

  // Error handler that mirrors the production error response shape, which
  // must include the request id so users can reference it in bug reports.
  app.use((err: Error, req: Request, res: Response, _next: NextFunction) => {
    const requestId = (req as Request & { requestId?: string }).requestId;
    res.status(500).json({
      error: {
        message: err.message,
        requestId,
      },
    });
  });

  return app;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('request id propagation (integration)', () => {
  let app: Express;

  beforeEach(async () => {
    vi.clearAllMocks();
    for (const key of Object.keys(spanAttributes)) {
      delete spanAttributes[key];
    }
    fetchMock.mockReset();
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({ accounts: [] }),
      text: async () => JSON.stringify({ accounts: [] }),
    });
    vi.stubGlobal('fetch', fetchMock);
    app = await buildApp();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('when the client does not send X-Request-ID', () => {
    it('generates a request id and echoes it on the response', async () => {
      const res = await request(app).get('/health');

      expect(res.status).toBe(200);
      const echoed = res.headers[REQUEST_ID_HEADER];
      expect(echoed).toBeDefined();
      expect(typeof echoed).toBe('string');
      expect(echoed.length).toBeGreaterThan(0);
    });

    it('generates a unique request id per request', async () => {
      const first = await request(app).get('/health');
      const second = await request(app).get('/health');

      expect(first.headers[REQUEST_ID_HEADER]).not.toBe(
        second.headers[REQUEST_ID_HEADER],
      );
    });

    it('forwards the generated request id to stellar-service', async () => {
      const res = await request(app).get('/proxy');

      expect(res.status).toBe(200);
      const generated = res.headers[REQUEST_ID_HEADER];
      expect(generated).toBeDefined();

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      const headers = new Headers(init?.headers as HeadersInit);
      expect(headers.get(REQUEST_ID_HEADER)).toBe(generated);
    });

    it('includes the generated request id in error response bodies', async () => {
      const res = await request(app).get('/boom');

      expect(res.status).toBe(500);
      const echoed = res.headers[REQUEST_ID_HEADER];
      expect(echoed).toBeDefined();
      expect(res.body.error.requestId).toBe(echoed);
    });

    it('attaches the request id to the active OTel span', async () => {
      const res = await request(app).get('/health');

      const echoed = res.headers[REQUEST_ID_HEADER];
      expect(echoed).toBeDefined();
      expect(mockSpan.setAttribute).toHaveBeenCalledWith(
        'request.id',
        echoed,
      );
      expect(spanAttributes['request.id']).toBe(echoed);
    });
  });

  describe('when the client sends X-Request-ID', () => {
    const clientRequestId = 'client-supplied-request-id-abc123';

    it('passes the client request id through and echoes it', async () => {
      const res = await request(app)
        .get('/health')
        .set(REQUEST_ID_HEADER, clientRequestId);

      expect(res.status).toBe(200);
      expect(res.headers[REQUEST_ID_HEADER]).toBe(clientRequestId);
    });

    it('forwards the client request id to stellar-service', async () => {
      const res = await request(app)
        .get('/proxy')
        .set(REQUEST_ID_HEADER, clientRequestId);

      expect(res.status).toBe(200);
      expect(res.headers[REQUEST_ID_HEADER]).toBe(clientRequestId);

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      const headers = new Headers(init?.headers as HeadersInit);
      expect(headers.get(REQUEST_ID_HEADER)).toBe(clientRequestId);
    });

    it('includes the client request id in error response bodies', async () => {
      const res = await request(app)
        .get('/boom')
        .set(REQUEST_ID_HEADER, clientRequestId);

      expect(res.status).toBe(500);
      expect(res.headers[REQUEST_ID_HEADER]).toBe(clientRequestId);
      expect(res.body.error.requestId).toBe(clientRequestId);
    });

    it('attaches the client request id to the active OTel span', async () => {
      await request(app)
        .get('/health')
        .set(REQUEST_ID_HEADER, clientRequestId);

      expect(mockSpan.setAttribute).toHaveBeenCalledWith(
        'request.id',
        clientRequestId,
      );
      expect(spanAttributes['request.id']).toBe(clientRequestId);
    });
  });

  describe('OpenTelemetry correlation', () => {
    it('records the trace id alongside the request id on the span', async () => {
      const res = await request(app).get('/health');
      const echoed = res.headers[REQUEST_ID_HEADER];

      expect(echoed).toBeDefined();
      expect(spanAttributes['request.id']).toBe(echoed);
      // The middleware should correlate the OTel trace id with the request id
      // so logs and traces can be joined.
      expect(spanAttributes['trace.id']).toBe('trace-id-123');
    });
  });
});