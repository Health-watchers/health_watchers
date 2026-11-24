/**
 * Jest configuration used exclusively by Stryker for mutation testing.
 * Must be CJS (not ESM) so that Stryker's jest-runner can require() it.
 *
 * Mirrors jest.config.ts but omits coverage and runs only the modules
 * under mutation to keep runs fast and focused.
 *
 * Modules covered (matching stryker.config.json `mutate` array):
 *   - auth/token.service
 *   - auth/jwt-claim-validator
 *   - services/token-denylist.service
 *   - auth/services/backup-code.service
 *   - utils/paginate
 *   - utils/sanitize
 *   - lib/encrypt
 *   - modules/patients/duplicate-detection.service
 *   - utils/app-error
 */
const path = require('path');

const srcRoot = path.resolve(__dirname, 'src');

module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',

  moduleNameMapper: {
    '^@api/(.*)$': `${srcRoot}/$1`,
    '^@/(.*)$': `${srcRoot}/$1`,
    '^@api/middlewares/rate-limit\\.middleware$': `${srcRoot}/__mocks__/rate-limit.middleware.ts`,
    [`^${srcRoot.replace(/\\/g, '\\\\')}/middlewares/rate-limit\\.middleware$`]: `${srcRoot}/__mocks__/rate-limit.middleware.ts`,
    '^pino-http$': `${srcRoot}/__mocks__/pino-http.ts`,
    '^@sentry/profiling-node$': `${srcRoot}/__mocks__/sentry-profiling-node.ts`,
  },

  modulePaths: [
    path.resolve(__dirname, 'node_modules'),
    path.resolve(__dirname, '../../node_modules'),
  ],

  testMatch: [
    // Auth module — original coverage
    '**/modules/auth/**/*.test.ts',
    '**/services/token-denylist.service.test.ts',
    // Utility modules — newly added
    '**/utils/paginate.test.ts',
    '**/utils/sanitize.test.ts',
    '**/lib/encrypt.test.ts',
    '**/lib/encrypt.perf.test.ts',
    '**/modules/patients/duplicate-detection.service.test.ts',
  ],

  testPathIgnorePatterns: ['/node_modules/'],

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

  setupFiles: ['<rootDir>/src/test-setup.ts'],
  testTimeout: 30000,
  forceExit: true,
};
