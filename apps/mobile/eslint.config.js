import baseConfig from '@health-watchers/config/eslint-config';

export default [
  ...baseConfig,
  {
    // Mobile: React Native and Expo specific rules
    ignores: ['dist/**', 'node_modules/**', '.expo/**', 'build/**'],
  },
];
