/**
 * Consumer contract tests: health-watchers-web → health-watchers-api
 *
 * These tests define the contract that the web frontend relies on when
 * talking to the backend auth API. Running them generates a pact file
 * (pacts/health-watchers-web-health-watchers-api.json) that the API
 * provider verification tests read and verify against the real server.
 *
 * Issue #911 — Contract Testing
 */
import path from 'path';
import { PactV3, MatchersV3 } from '@pact-foundation/pact';

const { like, string, integer } = MatchersV3;

const PACT_DIR = path.resolve(__dirname, '../../../../pacts');

const provider = new PactV3({
  consumer: 'health-watchers-web',
  provider: 'health-watchers-api',
  dir: PACT_DIR,
  logLevel: 'warn',
});

// ── Helpers ──────────────────────────────────────────────────────────────────

async function postJson(baseUrl: string, endpoint: string, body: unknown) {
  const res = await fetch(`${baseUrl}${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
}

async function getJson(baseUrl: string, endpoint: string, token?: string) {
  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${baseUrl}${endpoint}`, { headers });
  return { status: res.status, body: await res.json() };
}

// ── Auth Contract Tests ───────────────────────────────────────────────────────

describe('Auth API contract (web → api)', () => {
  describe('POST /api/v1/auth/login', () => {
    it('returns access and refresh tokens for valid credentials', async () => {
      await provider
        .addInteraction({
          states: [{ description: 'a registered user exists with email doctor@clinic.com' }],
          uponReceiving: 'a login request with valid credentials',
          withRequest: {
            method: 'POST',
            path: '/api/v1/auth/login',
            headers: { 'Content-Type': 'application/json' },
            body: {
              email: 'doctor@clinic.com',
              password: 'SecurePass123!',
            },
          },
          willRespondWith: {
            status: 200,
            headers: { 'Content-Type': like('application/json') },
            body: {
              data: {
                accessToken: string('eyJhbGciOiJIUzI1NiJ9.stub.signature'),
                refreshToken: string('eyJhbGciOiJIUzI1NiJ9.stub.signature'),
              },
            },
          },
        })
        .executeTest(async (mockServer) => {
          const result = await postJson(mockServer.url, '/api/v1/auth/login', {
            email: 'doctor@clinic.com',
            password: 'SecurePass123!',
          });

          expect(result.status).toBe(200);
          expect(result.body.data).toHaveProperty('accessToken');
          expect(result.body.data).toHaveProperty('refreshToken');
          expect(typeof result.body.data.accessToken).toBe('string');
          expect(typeof result.body.data.refreshToken).toBe('string');
        });
    });

    it('returns 401 for invalid credentials', async () => {
      await provider
        .addInteraction({
          states: [{ description: 'a registered user exists with email doctor@clinic.com' }],
          uponReceiving: 'a login request with invalid password',
          withRequest: {
            method: 'POST',
            path: '/api/v1/auth/login',
            headers: { 'Content-Type': 'application/json' },
            body: {
              email: 'doctor@clinic.com',
              password: 'WrongPassword!',
            },
          },
          willRespondWith: {
            status: 401,
            headers: { 'Content-Type': like('application/json') },
            body: {
              error: string('Unauthorized'),
            },
          },
        })
        .executeTest(async (mockServer) => {
          const result = await postJson(mockServer.url, '/api/v1/auth/login', {
            email: 'doctor@clinic.com',
            password: 'WrongPassword!',
          });

          expect(result.status).toBe(401);
          expect(result.body).toHaveProperty('error');
        });
    });
  });

  describe('POST /api/v1/auth/refresh', () => {
    it('returns a new access token for a valid refresh token', async () => {
      await provider
        .addInteraction({
          states: [{ description: 'a valid refresh token exists' }],
          uponReceiving: 'a token refresh request with a valid refresh token',
          withRequest: {
            method: 'POST',
            path: '/api/v1/auth/refresh',
            headers: { 'Content-Type': 'application/json' },
            body: {
              refreshToken: string('valid-refresh-token'),
            },
          },
          willRespondWith: {
            status: 200,
            headers: { 'Content-Type': like('application/json') },
            body: {
              data: {
                accessToken: string('eyJhbGciOiJIUzI1NiJ9.stub.signature'),
                refreshToken: string('eyJhbGciOiJIUzI1NiJ9.stub.signature'),
              },
            },
          },
        })
        .executeTest(async (mockServer) => {
          const result = await postJson(mockServer.url, '/api/v1/auth/refresh', {
            refreshToken: 'valid-refresh-token',
          });

          expect(result.status).toBe(200);
          expect(result.body.data).toHaveProperty('accessToken');
          expect(typeof result.body.data.accessToken).toBe('string');
        });
    });

    it('returns 401 for an invalid refresh token', async () => {
      await provider
        .addInteraction({
          states: [{ description: 'no valid refresh token exists for the given value' }],
          uponReceiving: 'a token refresh request with an expired refresh token',
          withRequest: {
            method: 'POST',
            path: '/api/v1/auth/refresh',
            headers: { 'Content-Type': 'application/json' },
            body: {
              refreshToken: string('expired-or-invalid-token'),
            },
          },
          willRespondWith: {
            status: 401,
            headers: { 'Content-Type': like('application/json') },
            body: {
              error: string('Unauthorized'),
            },
          },
        })
        .executeTest(async (mockServer) => {
          const result = await postJson(mockServer.url, '/api/v1/auth/refresh', {
            refreshToken: 'expired-or-invalid-token',
          });

          expect(result.status).toBe(401);
          expect(result.body).toHaveProperty('error');
        });
    });
  });

  describe('GET /health', () => {
    it('returns a 200 health check response', async () => {
      await provider
        .addInteraction({
          states: [{ description: 'the API is running' }],
          uponReceiving: 'a health check request',
          withRequest: {
            method: 'GET',
            path: '/health',
          },
          willRespondWith: {
            status: 200,
            headers: { 'Content-Type': like('application/json') },
            body: {
              status: string('ok'),
            },
          },
        })
        .executeTest(async (mockServer) => {
          const result = await getJson(mockServer.url, '/health');

          expect(result.status).toBe(200);
          expect(result.body).toHaveProperty('status');
          expect(result.body.status).toBe('ok');
        });
    });
  });
});
