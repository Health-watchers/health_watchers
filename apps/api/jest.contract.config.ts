import type { Config } from 'jest';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const srcRoot = path.resolve(__dirname, 'src');

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/contracts/**/*.provider.pact.test.ts'],
  moduleNameMapper: {
    '^@api/(.*)$': `${srcRoot}/$1`,
    '^@/(.*)$': `${srcRoot}/$1`,
    '^pino-http$': `${srcRoot}/__mocks__/pino-http.ts`,
    '^@sentry/profiling-node$': `${srcRoot}/__mocks__/sentry-profiling-node.ts`,
    '^@api/middlewares/rate-limit\\.middleware$': `${srcRoot}/__mocks__/rate-limit.middleware.ts`,
    [`^${srcRoot.replace(/\\/g, '\\\\')}/middlewares/rate-limit\\.middleware$`]: `${srcRoot}/__mocks__/rate-limit.middleware.ts`,
  },
  modulePaths: [
    path.resolve(__dirname, 'node_modules'),
    path.resolve(__dirname, '../../node_modules'),
  ],
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
  testTimeout: 60000,
  forceExit: true,
};

export default config;
