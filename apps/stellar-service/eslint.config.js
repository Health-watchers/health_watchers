import baseConfig from '@health-watchers/config/eslint-config';

export default [
  ...baseConfig,
  {
    // stellar-service specific overrides
    // Note: no-console is enforced by the shared config; only add
    // service-specific rules here when they differ from the canonical set.
    ignores: ['dist/**', 'node_modules/**'],
  },
];