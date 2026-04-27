import baseConfig from '@health-watchers/config/eslint-config';

export default [
  ...baseConfig,
  {
    // API: stricter — no console.log (use logger), explicit return types required
    rules: {
      'no-console': 'error',
      '@typescript-eslint/explicit-function-return-type': 'error',
    },
    ignores: ['dist/**', 'node_modules/**'],
  },
];
