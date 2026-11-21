// Root ESLint config — re-exports the canonical shared config from
// packages/config/eslint-config so lint-staged and repo-wide linting use
// the consolidated rules. Per-app configs extend the same shared config.

import sharedConfig from './packages/config/eslint-config/index.js';

export default [
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/.next/**',
      '**/coverage/**',
      '**/build/**',
    ],
  },
  ...sharedConfig,
];