/**
 * Consumer contract tests: health-watchers-web → health-watchers-api
 * Covers encounter CRUD endpoints.
 *
 * Generates pact file: pacts/health-watchers-web-health-watchers-api.json
 * (merged with the patients/payments and auth contracts by the Pact framework).
 *
 * Closes #1646 — Contract tests for API ↔ Web consumer/provider
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

async function postJson(
  baseUrl: string,
  endpoint: string,
  body: unknown,
  token = 'stub-bearer-token'
) {
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

async function patchJson(
  baseUrl: string,
  endpoint: string,
  body: unknown,
  token = 'stub-bearer-token'
) {
  const res = await fetch(`${baseUrl}${endpoint}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
}

async function deleteJson(baseUrl: string, endpoint: string, token = 'stub-bearer-token') {
  const res = await fetch(`${baseUrl}${endpoint}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  return { status: res.status, body: await res.json() };
}

// ── Encounter Contract Tests ──────────────────────────────────────────────────

describe('Encounters API contract (web → api)', () => {
  describe('GET /api/v1/encounters', () => {
    it('returns a paginated list of encounters for the authenticated clinic', async () => {
      await provider
        .addInteraction({
          states: [{ description: 'encounters exist for the authenticated clinic' }],
          uponReceiving: 'a request to list encounters',
          withRequest: {
            method: 'GET',
            path: '/api/v1/encounters',
            headers: { Authorization: like('Bearer stub-bearer-token') },
          },
          willRespondWith: {
            status: 200,
            headers: { 'Content-Type': like('application/json') },
            body: {
              status: string('success'),
              data: eachLike({
                _id: string('encounter-id-1'),
                patientId: string('patient-id-1'),
                attendingDoctorId: string('doctor-id-1'),
                chiefComplaint: string('Follow-up visit'),
                status: string('open'),
              }),
              meta: like({
                total: integer(1),
                page: integer(1),
                limit: integer(20),
              }),
            },
          },
        })
        .executeTest(async (mockServer) => {
          const result = await getJson(mockServer.url, '/api/v1/encounters');
          expect(result.status).toBe(200);
          expect(Array.isArray(result.body.data)).toBe(true);
          expect(result.body).toHaveProperty('meta');
        });
    });
  });

  describe('GET /api/v1/encounters/:id', () => {
    it('returns a single encounter by ID', async () => {
      await provider
        .addInteraction({
          states: [{ description: 'an encounter with ID encounter-id-1 exists' }],
          uponReceiving: 'a request to get a specific encounter',
          withRequest: {
            method: 'GET',
            path: '/api/v1/encounters/encounter-id-1',
            headers: { Authorization: like('Bearer stub-bearer-token') },
          },
          willRespondWith: {
            status: 200,
            headers: { 'Content-Type': like('application/json') },
            body: {
              status: string('success'),
              data: like({
                _id: string('encounter-id-1'),
                patientId: string('patient-id-1'),
                chiefComplaint: string('Follow-up visit'),
                status: string('open'),
              }),
            },
          },
        })
        .executeTest(async (mockServer) => {
          const result = await getJson(mockServer.url, '/api/v1/encounters/encounter-id-1');
          expect(result.status).toBe(200);
          expect(result.body.data).toHaveProperty('chiefComplaint');
        });
    });

    it('returns 404 when the encounter does not exist', async () => {
      await provider
        .addInteraction({
          states: [{ description: 'no encounter with ID nonexistent-id exists' }],
          uponReceiving: 'a request for an encounter that does not exist',
          withRequest: {
            method: 'GET',
            path: '/api/v1/encounters/nonexistent-id',
            headers: { Authorization: like('Bearer stub-bearer-token') },
          },
          willRespondWith: {
            status: 404,
            headers: { 'Content-Type': like('application/json') },
            body: { error: string('NotFound'), message: string('Encounter not found') },
          },
        })
        .executeTest(async (mockServer) => {
          const result = await getJson(mockServer.url, '/api/v1/encounters/nonexistent-id');
          expect(result.status).toBe(404);
        });
    });
  });

  describe('POST /api/v1/encounters', () => {
    it('creates a new encounter and returns 201 with the encounter record', async () => {
      await provider
        .addInteraction({
          states: [{ description: 'a patient and attending doctor exist for the clinic' }],
          uponReceiving: 'a request to create a new encounter',
          withRequest: {
            method: 'POST',
            path: '/api/v1/encounters',
            headers: {
              'Content-Type': 'application/json',
              Authorization: like('Bearer stub-bearer-token'),
            },
            body: {
              patientId: string('patient-id-1'),
              clinicId: string('clinic-id-1'),
              attendingDoctorId: string('doctor-id-1'),
              chiefComplaint: string('Annual check-up'),
            },
          },
          willRespondWith: {
            status: 201,
            headers: { 'Content-Type': like('application/json') },
            body: {
              status: string('success'),
              data: like({
                _id: string('encounter-id-new'),
                patientId: string('patient-id-1'),
                chiefComplaint: string('Annual check-up'),
                status: string('open'),
              }),
            },
          },
        })
        .executeTest(async (mockServer) => {
          const result = await postJson(mockServer.url, '/api/v1/encounters', {
            patientId: 'patient-id-1',
            clinicId: 'clinic-id-1',
            attendingDoctorId: 'doctor-id-1',
            chiefComplaint: 'Annual check-up',
          });
          expect(result.status).toBe(201);
          expect(result.body.data).toHaveProperty('_id');
        });
    });
  });

  describe('PATCH /api/v1/encounters/:id', () => {
    it('updates an open encounter and returns the updated record', async () => {
      await provider
        .addInteraction({
          states: [{ description: 'an open encounter with ID encounter-id-1 exists' }],
          uponReceiving: 'a request to update an encounter',
          withRequest: {
            method: 'PATCH',
            path: '/api/v1/encounters/encounter-id-1',
            headers: {
              'Content-Type': 'application/json',
              Authorization: like('Bearer stub-bearer-token'),
            },
            body: {
              notes: string('Patient reports improvement'),
            },
          },
          willRespondWith: {
            status: 200,
            headers: { 'Content-Type': like('application/json') },
            body: {
              status: string('success'),
              data: like({
                _id: string('encounter-id-1'),
                notes: string('Patient reports improvement'),
              }),
            },
          },
        })
        .executeTest(async (mockServer) => {
          const result = await patchJson(mockServer.url, '/api/v1/encounters/encounter-id-1', {
            notes: 'Patient reports improvement',
          });
          expect(result.status).toBe(200);
          expect(result.body.data.notes).toBe('Patient reports improvement');
        });
    });

    it('returns 409 when updating a closed encounter', async () => {
      await provider
        .addInteraction({
          states: [{ description: 'a closed encounter with ID encounter-id-closed exists' }],
          uponReceiving: 'a request to update a closed encounter',
          withRequest: {
            method: 'PATCH',
            path: '/api/v1/encounters/encounter-id-closed',
            headers: {
              'Content-Type': 'application/json',
              Authorization: like('Bearer stub-bearer-token'),
            },
            body: {
              notes: string('Trying to edit after close'),
            },
          },
          willRespondWith: {
            status: 409,
            headers: { 'Content-Type': like('application/json') },
            body: { error: string('Conflict'), message: like('Cannot edit a closed encounter') },
          },
        })
        .executeTest(async (mockServer) => {
          const result = await patchJson(
            mockServer.url,
            '/api/v1/encounters/encounter-id-closed',
            { notes: 'Trying to edit after close' }
          );
          expect(result.status).toBe(409);
        });
    });
  });

  describe('DELETE /api/v1/encounters/:id', () => {
    it('cancels an encounter and returns the cancelled record', async () => {
      await provider
        .addInteraction({
          states: [{ description: 'an encounter with ID encounter-id-1 exists' }],
          uponReceiving: 'a request to cancel an encounter',
          withRequest: {
            method: 'DELETE',
            path: '/api/v1/encounters/encounter-id-1',
            headers: { Authorization: like('Bearer stub-bearer-token') },
          },
          willRespondWith: {
            status: 200,
            headers: { 'Content-Type': like('application/json') },
            body: {
              status: string('success'),
              message: string('Encounter cancelled'),
              data: like({ _id: string('encounter-id-1'), status: string('cancelled') }),
            },
          },
        })
        .executeTest(async (mockServer) => {
          const result = await deleteJson(mockServer.url, '/api/v1/encounters/encounter-id-1');
          expect(result.status).toBe(200);
          expect(result.body.data.status).toBe('cancelled');
        });
    });
  });
});
