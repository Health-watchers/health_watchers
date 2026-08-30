// Shared Pact configuration for consumer and provider contract tests.
module.exports = {
  consumer: 'health-watchers-web',
  provider: 'health-watchers-api',
  pactDir: './pacts',
  logDir: './logs/pact',
  logLevel: 'info',
  spec: 3,
  brokerBaseUrl: process.env.PACT_BROKER_BASE_URL,
  brokerToken: process.env.PACT_BROKER_TOKEN,
  publishVerificationResult: true,
  providerVersion: process.env.PACT_PROVIDER_VERSION || 'local',
  providerVersionBranch: process.env.PACT_PROVIDER_BRANCH || 'local',
  consumerVersionSelectors: [
    { mainBranch: true },
    { deployedOrReleased: true },
  ],
  enablePending: true,
  includeWipPactsSince: '2026-01-01',
};
