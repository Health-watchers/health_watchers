import baseConfig from '@health-watchers/config/eslint-config';

export default [
  ...baseConfig,
  {
    ignores: ['dist/**', 'node_modules/**'],
  },
];
