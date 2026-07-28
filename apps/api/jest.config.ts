import type { Config } from 'jest';
import path from 'path';
import { fileURLToPath } from 'url';

// Jest 30 evaluates .ts config files as ESM, so __dirname is not available.
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const srcRoot = path.resolve(__dirname, 'src');

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',

  // Resolve @api/* and @/* path aliases — must point to the src directory
  moduleNameMapper: {
    '^@api/(.*)$': `${srcRoot}/$1`,
    '^@/(.*)$': `${srcRoot}/$1`,
    // Mock the rate-limit middleware so tests don't need redis installed.
    // Match both the @api alias and the resolved absolute path.
    '^@api/middlewares/rate-limit\\.middleware$': `${srcRoot}/__mocks__/rate-limit.middleware.ts`,
    [`^${srcRoot.replace(/\\/g, '\\\\')}/middlewares/rate-limit\\.middleware$`]: `${srcRoot}/__mocks__/rate-limit.middleware.ts`,
    // Mock pino-http so tests don't need a real pino logger with .child()
    '^pino-http$': `${srcRoot}/__mocks__/pino-http.ts`,
    // Mock Sentry profiling native binary — not available in test environments
    '^@sentry/profiling-node$': `${srcRoot}/__mocks__/sentry-profiling-node.ts`,
  },

  // Tell Jest to look in the API workspace's node_modules first, then the root
  // This ensures express and its transitive deps are found correctly in the monorepo
  modulePaths: [
    path.resolve(__dirname, 'node_modules'),
    path.resolve(__dirname, '../../node_modules'),
  ],

  // Only pick up .test.ts files; exclude tests that require a live MongoDB
  testMatch: ['**/*.test.ts'],
  testPathIgnorePatterns: [
    '/node_modules/',
    'src/modules/audit/audit.test.ts', // requires live MongoDB
    'src/__tests__/unit/clinicId-consistency.test.ts', // requires live MongoDB
  ],

  // ts-jest: compile with CommonJS so Jest can import the output
  // isolatedModules is set in tsconfig.test.json to avoid the deprecation warning
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        tsconfig: {
          module: 'CommonJS',
          esModuleInterop: true,
          isolatedModules: true,
          baseUrl: srcRoot,
          paths: {
            '@api/*': [`${srcRoot}/*`],
            '@/*': [`${srcRoot}/*`],
          },
        },
      },
    ],
  },

  // Coverage: auth + payments + patient model + middlewares + newly-tested modules
  collectCoverageFrom: [
    'src/modules/auth/**/*.ts',
    'src/modules/payments/**/*.ts',
    'src/modules/patients/models/patient.model.ts',
    'src/middlewares/**/*.ts',
    'src/utils/asyncHandler.ts',
    'src/modules/care-plans/care-plan.model.ts',
    'src/modules/care-plans/care-plan.validation.ts',
    'src/modules/care-plans/care-plans.controller.ts',
    'src/modules/communications/communication-log.model.ts',
    'src/modules/communications/communication.validation.ts',
    'src/modules/communications/communication.service.ts',
    'src/modules/compliance/baa.model.ts',
    'src/modules/compliance/breach.model.ts',
    'src/modules/consent/consent.model.ts',
    'src/modules/consent/consent.controller.ts',
    'src/modules/cpt/cpt.model.ts',
    'src/modules/documents/models/document.model.ts',
    'src/modules/documents/models/document-version.model.ts',
    'src/modules/immunizations/immunization.model.ts',
    'src/modules/immunizations/immunization.validation.ts',
    'src/modules/lab-results/lab-result.model.ts',
    'src/modules/lab-results/critical-value.service.ts',
    'src/modules/notifications/notification.model.ts',
    'src/modules/notifications/notification.service.ts',
    'src/modules/notifications/notifications.controller.ts',
    'src/modules/referrals/referral.model.ts',
    'src/modules/reports/reports.validation.ts',
    'src/modules/reports/benchmarking.service.ts',
    'src/modules/subscriptions/usage.service.ts',
    'src/modules/subscriptions/billing.service.ts',
    'src/modules/surveys/survey.model.ts',
    'src/modules/surveys/survey.validation.ts',
    'src/modules/webhooks/webhook.model.ts',
    'src/modules/webhooks/webhook.validation.ts',
    'src/modules/cds/cds-rules-engine.ts',
    'src/modules/cds/cds-rule.model.ts',
    '!src/modules/auth/**/*.test.ts',
    '!src/modules/auth/**/*.d.ts',
    '!src/modules/payments/**/*.test.ts',
    '!src/modules/payments/**/__tests__/**',
    '!src/modules/payments/**/*.d.ts',
    '!src/middlewares/**/*.test.ts',
    '!src/middlewares/__tests__/**',
    '!src/middlewares/__mocks__/**',
  ],

  coverageThreshold: {
    global: {
      lines: 80,
      branches: 80,
    },
    './src/modules/payments/': {
      lines: 85,
      branches: 85,
    },
  },

  coverageReporters: ['text', 'lcov', 'json'],
  coverageDirectory: 'coverage',

  // Prevent open handles from Express/Mongoose keeping the process alive
  forceExit: true,
  detectOpenHandles: false,

  // Global setup: set env vars before any test file runs
  setupFiles: ['<rootDir>/src/test-setup.ts'],

  // Increase timeout for integration tests
  testTimeout: 30000,
};

export default config;
