import baseConfig from '@health-watchers/config/eslint-config';
import nextPlugin from '@next/eslint-plugin-next';
import jsxA11y from 'eslint-plugin-jsx-a11y';

export default [
  ...baseConfig,
  {
    // Web: Next.js core-web-vitals rules (migrated from legacy .eslintrc.json)
    plugins: {
      '@next/next': nextPlugin,
      'jsx-a11y': jsxA11y,
    },
    rules: {
      ...nextPlugin.configs['core-web-vitals'].rules,
      ...jsxA11y.configs.recommended.rules,
    },
  },
  {
    ignores: ['dist/**', 'node_modules/**', '.next/**'],
  },
];