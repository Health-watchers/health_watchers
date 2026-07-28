/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node', // Pact needs Node environment, not jsdom
  roots: ['<rootDir>/src/contracts'],
  testMatch: ['**/*.pact.test.ts'],
  transform: {
    '^.+\\.(ts|tsx|js|jsx)$': ['babel-jest', { configFile: './babel.config.test.js' }],
  },
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],
  testTimeout: 30000,
};
