// Example consumer contract test for the health-watchers patient API.
// Run via `npm run test:contract:consumer`.
const { PactV3, MatchersV3 } = require('@pact-foundation/pact');
const path = require('path');
const config = require('./pact.config');

const { like, eachLike, string, iso8601DateTime } = MatchersV3;

const provider = new PactV3({
  consumer: config.consumer,
  provider: config.provider,
  dir: path.resolve(process.cwd(), config.pactDir),
  logLevel: config.logLevel,
});

describe('Patient API contract', () => {
  it('returns a patient by id', async () => {
    provider
      .given('a patient with id 123 exists')
      .uponReceiving('a request for patient 123')
      .withRequest({
        method: 'GET',
        path: '/api/patients/123',
      })
      .willRespondWith({
        status: 200,
        headers: { 'Content-Type': 'application/json' },
        body: {
          id: string('123'),
          name: string('Jane Doe'),
          createdAt: iso8601DateTime(),
        },
      });

    await provider.executeTest(async (mockServer) => {
      const response = await fetch(`${mockServer.url}/api/patients/123`);
      expect(response.status).toBe(200);
    });
  });

  it('returns a list of medications', async () => {
    provider
      .given('patient 123 has medications')
      .uponReceiving('a request for patient 123 medications')
      .withRequest({
        method: 'GET',
        path: '/api/patients/123/medications',
      })
      .willRespondWith({
        status: 200,
        headers: { 'Content-Type': 'application/json' },
        body: eachLike({
          id: like('med-1'),
          name: like('Lisinopril'),
          dosage: like('10mg'),
        }),
      });

    await provider.executeTest(async (mockServer) => {
      const response = await fetch(`${mockServer.url}/api/patients/123/medications`);
      expect(response.status).toBe(200);
    });
  });
});
