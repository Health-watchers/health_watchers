/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/apps/api/src', '<rootDir>/packages'],
  testMatch: ['**/*.test.ts'],
  moduleNameMapper: {
    '^@api/(.*)$': '<rootDir>/apps/api/src/$1',
    '^@health-watchers/config$': '<rootDir>/packages/config/index.ts',
    // Mock rate-limit (needs Redis) and pino-http
    '^@api/middlewares/rate-limit\\.middleware$':
      '<rootDir>/apps/api/src/__mocks__/rate-limit.middleware.ts',
    '<rootDir>/apps/api/src/middlewares/rate-limit\\.middleware$':
      '<rootDir>/apps/api/src/__mocks__/rate-limit.middleware.ts',
    '^pino-http$': '<rootDir>/apps/api/src/__mocks__/pino-http.ts',
    // Mock OpenTelemetry — incompatible with ts-jest/CommonJS
    '^@opentelemetry/resources$': '<rootDir>/apps/api/src/__mocks__/@opentelemetry/resources.js',
  },
  transform: {
    '^.+\\.ts$': [
      'ts-jest',
      {
        isolatedModules: true,
        useESM: false,
        tsconfig: {
          target: 'ES2020',
          module: 'commonjs',
          esModuleInterop: true,
          allowSyntheticDefaultImports: true,
          strict: false,
          skipLibCheck: true,
          types: ['jest', 'node'],
          baseUrl: '.',
          paths: {
            '@api/*': ['apps/api/src/*'],
            '@health-watchers/config': ['packages/config/index.ts'],
          },
        },
      },
    ],
  },
  setupFiles: ['<rootDir>/apps/api/src/test-setup.ts'],
  testPathIgnorePatterns: [
    '/node_modules/',
    '/dist/',
    'apps/api/src/modules/audit/audit.test.ts',
    'apps/api/src/__tests__/unit/clinicId-consistency.test.ts',
  ],
  moduleFileExtensions: ['ts', 'js', 'json'],
  forceExit: true,
  testTimeout: 30000,
};
