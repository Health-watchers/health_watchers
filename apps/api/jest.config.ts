import type { Config } from 'jest';
import path from 'path';

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
    'src/modules/audit/audit.test.ts',          // requires live MongoDB
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

  // Coverage: focus on the auth module
  collectCoverageFrom: [
    'src/modules/auth/**/*.ts',
    '!src/modules/auth/**/*.test.ts',
    '!src/modules/auth/**/*.d.ts',
  ],

  coverageThreshold: {
    global: {
      lines: 80,
      branches: 80,
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
