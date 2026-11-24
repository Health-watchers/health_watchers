module.exports = {
  preset: 'jest-expo',
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@unimodules/.*|unimodules|sentry-expo|native-base|react-native-svg|expo-local-authentication|expo-secure-store|expo-notifications|@react-native-community/netinfo)'
  ],
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  testMatch: [
    '**/__tests__/**/*.test.[jt]s?(x)',
    '**/?(*.)(spec|test).[jt]s?(x)',
    '**/__tests__/**/*biometric*.[jt]s?(x)',
    '**/__tests__/**/*offline*.[jt]s?(x)',
    '**/__tests__/**/*notification*.[jt]s?(x)'
  ],
  collectCoverageFrom: [
    'services/**/*.{js,jsx,ts,tsx}',
    'screens/**/*.{js,jsx,ts,tsx}',
    'components/**/*.{js,jsx,ts,tsx}',
    'utils/**/*.{js,jsx,ts,tsx}',
    '!**/__tests__/**',
    '!**/node_modules/**',
    '!**/coverage/**'
  ],
  coverageReporters: ['text', 'text-summary', 'lcov', 'json', 'json-summary', 'clover'],
  coverageThreshold: {
    global: {
      statements: 70,
      branches: 70,
      functions: 70,
      lines: 70
    },
    './services/': {
      statements: 70,
      branches: 70,
      functions: 70,
      lines: 70
    },
    './screens/': {
      statements: 70,
      branches: 70,
      functions: 70,
      lines: 70
    },
    './components/': {
      statements: 70,
      branches: 70,
      functions: 70,
      lines: 70
    },
    './utils/': {
      statements: 70,
      branches: 70,
      functions: 70,
      lines: 70
    }
  },
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
    '^@services/(.*)$': '<rootDir>/services/$1',
    '^@screens/(.*)$': '<rootDir>/screens/$1',
    '^@components/(.*)$': '<rootDir>/components/$1',
    '^@utils/(.*)$': '<rootDir>/utils/$1'
  },
  testEnvironment: 'node'
};