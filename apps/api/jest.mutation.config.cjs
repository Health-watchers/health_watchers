/**
 * Jest configuration used exclusively by Stryker for mutation testing.
 * Must be CJS (not ESM) so that Stryker's jest-runner can require() it.
 *
 * Mirrors jest.config.ts but omits coverage and runs only the auth module
 * tests to keep mutation runs fast and focused.
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

  testMatch: ['**/modules/auth/**/*.test.ts', '**/services/token-denylist.service.test.ts'],

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
