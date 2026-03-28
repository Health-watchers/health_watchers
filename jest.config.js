/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/apps', '<rootDir>/packages'],
  moduleNameMapper: {
    '^@api/(.*)$': '<rootDir>/apps/api/src/$1',
    '^@health-watchers/config$': '<rootDir>/packages/config/index.ts',
  },
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        diagnostics: false,
        tsconfig: {
          module: 'commonjs',
          esModuleInterop: true,
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
  testPathIgnorePatterns: ['/node_modules/'],
};
