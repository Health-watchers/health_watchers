import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: 'src',
  testMatch: ['**/__tests__/**/*.test.ts'],
  moduleNameMapper: {
    '^@health-watchers/config$': '<rootDir>/../../../packages/config/index.ts',
    '^@health-watchers/types$':  '<rootDir>/../../../packages/types/src/index.ts',
  },
  coverageDirectory: '../coverage',
  collectCoverageFrom: [
    'middlewares/validate.middleware.ts',
    'modules/auth/token.service.ts',
    'middlewares/rbac.middleware.ts',
  ],
  coverageThresholds: {
    './middlewares/validate.middleware.ts': { lines: 90, functions: 90, branches: 90, statements: 90 },
    './modules/auth/token.service.ts':     { lines: 90, functions: 90, branches: 90, statements: 90 },
  },
  setupFiles: ['<rootDir>/../jest.setup.ts'],
};

export default config;
