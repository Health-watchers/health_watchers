// Provider verification against published consumer contracts.
// Run via `npm run test:contract:provider`.
const { Verifier } = require('@pact-foundation/pact');
const config = require('./pact.config');

describe('Patient API provider verification', () => {
  it('satisfies all consumer contracts', () => {
    return new Verifier({
      provider: config.provider,
      providerBaseUrl: process.env.PROVIDER_BASE_URL || 'http://localhost:3000',
      pactBrokerUrl: config.brokerBaseUrl,
      pactBrokerToken: config.brokerToken,
      publishVerificationResult: config.publishVerificationResult,
      providerVersion: config.providerVersion,
      providerVersionBranch: config.providerVersionBranch,
      consumerVersionSelectors: config.consumerVersionSelectors,
      enablePending: config.enablePending,
      includeWipPactsSince: config.includeWipPactsSince,
      stateHandlers: {
        'a patient with id 123 exists': () => Promise.resolve(),
        'patient 123 has medications': () => Promise.resolve(),
      },
    }).verifyProvider();
  });
});
