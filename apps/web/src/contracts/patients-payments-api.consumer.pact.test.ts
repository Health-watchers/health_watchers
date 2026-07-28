/**
 * Consumer contract tests: health-watchers-web → health-watchers-api
 * Covers patient and payment API endpoints.
 *
 * Generates pact file: pacts/health-watchers-web-health-watchers-api.json
 * (merged with auth contracts by the Pact framework).
 *
 * Closes #1035 — Contract Testing
 */
import path from 'path';
import { PactV3, MatchersV3 } from '@pact-foundation/pact';

const { like, string, integer, eachLike } = MatchersV3;

const PACT_DIR = path.resolve(__dirname, '../../../../pacts');

const provider = new PactV3({
  consumer: 'health-watchers-web',
  provider: 'health-watchers-api',
  dir: PACT_DIR,
  logLevel: 'warn',
});

// ── Helpers ──────────────────────────────────────────────────────────────────

async function getJson(baseUrl: string, endpoint: string, token = 'stub-bearer-token') {
  const res = await fetch(`${baseUrl}${endpoint}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return { status: res.status, body: await res.json() };
}

async function postJson(baseUrl: string, endpoint: string, body: unknown, token = 'stub-bearer-token') {
  const res = await fetch(`${baseUrl}${endpoint}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
}

// ── Patient Contract Tests ────────────────────────────────────────────────────

describe('Patients API contract (web → api)', () => {
  describe('GET /api/v1/patients', () => {
    it('returns a paginated list of patients for an authenticated user', async () => {
      await provider
        .addInteraction({
          states: [{ description: 'patients exist for the authenticated clinic' }],
          uponReceiving: 'a request to list patients',
          withRequest: {
            method: 'GET',
            path: '/api/v1/patients',
            headers: { Authorization: like('Bearer stub-bearer-token') },
          },
          willRespondWith: {
            status: 200,
            headers: { 'Content-Type': like('application/json') },
            body: {
              data: eachLike({
                _id: string('patient-id-1'),
                firstName: string('Jane'),
                lastName: string('Doe'),
                systemId: string('PAT-001'),
              }),
              pagination: like({
                total: integer(1),
                page: integer(1),
                limit: integer(20),
              }),
            },
          },
        })
        .executeTest(async (mockServer) => {
          const result = await getJson(mockServer.url, '/api/v1/patients');
          expect(result.status).toBe(200);
          expect(result.body).toHaveProperty('data');
          expect(Array.isArray(result.body.data)).toBe(true);
          expect(result.body).toHaveProperty('pagination');
        });
    });
  });

  describe('GET /api/v1/patients/:id', () => {
    it('returns a single patient by ID', async () => {
      await provider
        .addInteraction({
          states: [{ description: 'a patient with ID patient-id-1 exists' }],
          uponReceiving: 'a request to get a specific patient',
          withRequest: {
            method: 'GET',
            path: '/api/v1/patients/patient-id-1',
            headers: { Authorization: like('Bearer stub-bearer-token') },
          },
          willRespondWith: {
            status: 200,
            headers: { 'Content-Type': like('application/json') },
            body: {
              data: like({
                _id: string('patient-id-1'),
                firstName: string('Jane'),
                lastName: string('Doe'),
                systemId: string('PAT-001'),
                isActive: true,
              }),
            },
          },
        })
        .executeTest(async (mockServer) => {
          const result = await getJson(mockServer.url, '/api/v1/patients/patient-id-1');
          expect(result.status).toBe(200);
          expect(result.body).toHaveProperty('data');
          expect(result.body.data).toHaveProperty('firstName');
        });
    });

    it('returns 404 when the patient does not exist', async () => {
      await provider
        .addInteraction({
          states: [{ description: 'no patient with ID nonexistent-id exists' }],
          uponReceiving: 'a request for a patient that does not exist',
          withRequest: {
            method: 'GET',
            path: '/api/v1/patients/nonexistent-id',
            headers: { Authorization: like('Bearer stub-bearer-token') },
          },
          willRespondWith: {
            status: 404,
            headers: { 'Content-Type': like('application/json') },
            body: {
              error: string('Not Found'),
            },
          },
        })
        .executeTest(async (mockServer) => {
          const result = await getJson(mockServer.url, '/api/v1/patients/nonexistent-id');
          expect(result.status).toBe(404);
          expect(result.body).toHaveProperty('error');
        });
    });
  });
});

// ── Payments Contract Tests ───────────────────────────────────────────────────

describe('Payments API contract (web → api)', () => {
  describe('GET /api/v1/payments', () => {
    it('returns a paginated list of payments', async () => {
      await provider
        .addInteraction({
          states: [{ description: 'payments exist for the authenticated clinic' }],
          uponReceiving: 'a request to list payments',
          withRequest: {
            method: 'GET',
            path: '/api/v1/payments',
            headers: { Authorization: like('Bearer stub-bearer-token') },
          },
          willRespondWith: {
            status: 200,
            headers: { 'Content-Type': like('application/json') },
            body: {
              data: eachLike({
                _id: string('payment-id-1'),
                intentId: string('intent-1'),
                amount: string('100.00'),
                status: string('confirmed'),
                assetCode: string('XLM'),
              }),
              pagination: like({
                total: integer(1),
                page: integer(1),
                limit: integer(20),
              }),
            },
          },
        })
        .executeTest(async (mockServer) => {
          const result = await getJson(mockServer.url, '/api/v1/payments');
          expect(result.status).toBe(200);
          expect(result.body).toHaveProperty('data');
          expect(Array.isArray(result.body.data)).toBe(true);
        });
    });
  });

  describe('POST /api/v1/payments', () => {
    it('creates a new payment and returns 201 with the payment record', async () => {
      await provider
        .addInteraction({
          states: [{ description: 'the authenticated clinic has a funded Stellar account' }],
          uponReceiving: 'a request to create a new payment',
          withRequest: {
            method: 'POST',
            path: '/api/v1/payments',
            headers: {
              'Content-Type': 'application/json',
              Authorization: like('Bearer stub-bearer-token'),
            },
            body: {
              destination: string('GDEST123456789ABCDEFGHIJKLMNOPQRS'),
              amount: string('50.00'),
              assetCode: string('XLM'),
            },
          },
          willRespondWith: {
            status: 201,
            headers: { 'Content-Type': like('application/json') },
            body: {
              data: like({
                intentId: string('intent-new'),
                status: string('pending'),
                amount: string('50.00'),
                assetCode: string('XLM'),
              }),
            },
          },
        })
        .executeTest(async (mockServer) => {
          const result = await postJson(mockServer.url, '/api/v1/payments', {
            destination: 'GDEST123456789ABCDEFGHIJKLMNOPQRS',
            amount: '50.00',
            assetCode: 'XLM',
          });
          expect(result.status).toBe(201);
          expect(result.body).toHaveProperty('data');
          expect(result.body.data).toHaveProperty('intentId');
        });
    });

    it('returns 401 when no authorization header is provided', async () => {
      await provider
        .addInteraction({
          states: [{ description: 'the API is running' }],
          uponReceiving: 'a payment request without authentication',
          withRequest: {
            method: 'POST',
            path: '/api/v1/payments',
            headers: { 'Content-Type': 'application/json' },
            body: {
              destination: string('GDEST123456789ABCDEFGHIJKLMNOPQRS'),
              amount: string('50.00'),
              assetCode: string('XLM'),
            },
          },
          willRespondWith: {
            status: 401,
            headers: { 'Content-Type': like('application/json') },
            body: { error: string('Unauthorized') },
          },
        })
        .executeTest(async (mockServer) => {
          const res = await fetch(`${mockServer.url}/api/v1/payments`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              destination: 'GDEST123456789ABCDEFGHIJKLMNOPQRS',
              amount: '50.00',
              assetCode: 'XLM',
            }),
          });
          const body = await res.json();
          expect(res.status).toBe(401);
          expect(body).toHaveProperty('error');
        });
    });
  });
});
