import baseConfig from '@health-watchers/config/eslint-config';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import pluginReact from 'eslint-plugin-react';

export default [
  ...baseConfig,
  {
    // Web: React accessibility rules
    plugins: {
      'jsx-a11y': jsxA11y,
      react: pluginReact,
    },
    rules: {
      ...jsxA11y.configs.recommended.rules,
      'react/jsx-no-target-blank': 'error',
    },
    ignores: ['dist/**', 'node_modules/**', '.next/**'],
  },
];
