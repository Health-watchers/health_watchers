import type { Config } from 'jest';
import path from 'path';
import { fileURLToPath } from 'url';

// Jest 30 evaluates .ts config files as ESM, so __dirname is not available.
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const srcRoot = path.resolve(__dirname, 'src');

/**
 * Dedicated config for the integration suite (apps/api/src/integration).
 *
 * - Each test file spins up its own in-memory MongoDB (mongodb-memory-server),
 *   so files can run in parallel workers without sharing data.
 * - maxWorkers bounds how many mongod instances run at once.
 * - Coverage is collected across the modules exercised by the workflows.
 */
const config: Config = {
  testEnvironment: 'node',

  moduleNameMapper: {
    '^@api/(.*)$': `${srcRoot}/$1`,
    '^@/(.*)$': `${srcRoot}/$1`,
    // Mock pino-http so tests don't need a real pino logger with .child()
    '^pino-http$': `${srcRoot}/__mocks__/pino-http.ts`,
    // Mock Sentry profiling native binary — not available in test environments
    '^@sentry/profiling-node$': `${srcRoot}/__mocks__/sentry-profiling-node.ts`,
  },

  modulePaths: [
    path.resolve(__dirname, 'node_modules'),
    path.resolve(__dirname, '../../node_modules'),
  ],

  testMatch: ['<rootDir>/src/integration/**/*.test.ts'],
  testPathIgnorePatterns: ['/node_modules/'],

  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        tsconfig: {
          module: 'CommonJS',
          esModuleInterop: true,
          isolatedModules: true,
          strict: false,
          skipLibCheck: true,
          types: ['jest', 'node'],
          baseUrl: srcRoot,
          paths: {
            '@api/*': [`${srcRoot}/*`],
            '@/*': [`${srcRoot}/*`],
          },
        },
      },
    ],
  },

  // Coverage of the modules exercised by the integration workflows.
  collectCoverageFrom: [
    'src/modules/**/*.ts',
    '!src/modules/**/*.test.ts',
    '!src/modules/**/__tests__/**',
    '!src/modules/**/*.d.ts',
  ],

  coverageReporters: ['text', 'lcov', 'json-summary'],
  coverageDirectory: 'coverage/integration',

  // Global setup: set env vars before any test file runs
  setupFiles: ['<rootDir>/src/test-setup.ts'],

  // Each worker runs its own mongod — bound concurrency to keep memory sane
  maxWorkers: 2,

  reporters: ['default', 'summary'],

  // Increase timeout for integration tests (mongod startup, DB round-trips)
  testTimeout: 30000,
};

export default config;
