import baseConfig from '@health-watchers/config/eslint-config';

export default [
  ...baseConfig,
  {
    // stellar-service: no-console enforced (use logger)
    rules: {
      'no-console': 'error',
    },
    ignores: ['dist/**', 'node_modules/**'],
  },
];
