import express, { type ErrorRequestHandler } from 'express';
import cors from 'cors';
import request from 'supertest';
import { buildCorsOptions, corsOriginCallback, isOriginAllowed } from './cors';

const ALLOWED = ['https://app.example.com'];

function decide(origin: string | undefined, allowed: readonly string[] = ALLOWED) {
  let result: { err: Error | null; allow?: boolean } | undefined;
  corsOriginCallback(allowed)(origin, (err, allow) => {
    result = { err, allow };
  });
  if (!result) throw new Error('cors origin callback did not call back synchronously');
  return result;
}

describe('CORS origin policy', () => {
  it('allows a listed origin', () => {
    expect(decide(ALLOWED[0])).toEqual({ err: null, allow: true });
  });

  it('allows server-to-server requests without an Origin header', () => {
    expect(decide(undefined)).toEqual({ err: null, allow: true });
  });

  it('refuses an unlisted origin without raising an error', () => {
    const { err, allow } = decide('https://evil.example.com');
    expect(allow).toBe(false);
    expect(err).toBeNull();
  });

  it('keeps the helper and the callback in agreement', () => {
    expect(isOriginAllowed(ALLOWED[0], ALLOWED)).toBe(true);
    expect(isOriginAllowed('https://evil.example.com', ALLOWED)).toBe(false);
    expect(isOriginAllowed(undefined, ALLOWED)).toBe(true);
  });

  describe('through the cors middleware', () => {
    const app = express();
    app.use(cors(buildCorsOptions(ALLOWED)));
    app.get('/ping', (_req, res) => {
      res.json({ ok: true });
    });
    // Mirrors production: any Error that reaches the final handler becomes a 500.
    const failLikeProduction: ErrorRequestHandler = (err, _req, res, _next) => {
      res.status(500).json({ error: err.message });
    };
    app.use(failLikeProduction);

    it('does not turn a disallowed origin into a 5xx', async () => {
      const res = await request(app).get('/ping').set('Origin', 'https://evil.example.com');
      expect(res.status).toBe(200);
      expect(res.headers['access-control-allow-origin']).toBeUndefined();
    });

    it('still sets the header for an allowed origin', async () => {
      const res = await request(app).get('/ping').set('Origin', ALLOWED[0]);
      expect(res.status).toBe(200);
      expect(res.headers['access-control-allow-origin']).toBe(ALLOWED[0]);
    });
  });
});
