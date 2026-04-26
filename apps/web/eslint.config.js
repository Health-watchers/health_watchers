import baseConfig from '@health-watchers/config/eslint-config';
import jsxA11y from 'eslint-plugin-jsx-a11y';

export default [
  ...baseConfig,
  {
    // Web: React accessibility rules
    plugins: { 'jsx-a11y': jsxA11y },
    rules: {
      ...jsxA11y.configs.recommended.rules,
    },
    ignores: ['dist/**', 'node_modules/**', '.next/**'],
  },
];
