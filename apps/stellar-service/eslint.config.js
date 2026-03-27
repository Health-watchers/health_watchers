const baseConfig = require('@health-watchers/config/eslint-config');

module.exports = [
  ...baseConfig,
  {
    ignores: ['dist/**', 'node_modules/**'],
  },
];
