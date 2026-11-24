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
  {
    // Reject the "batch dump" pattern: files named batch_*_implementations.ts
    // or batch_*_*.ts anywhere under apps/. These files historically stored
    // code and tests as template-literal strings, never ran, and misled
    // contributors. Real code belongs in its feature module with real tests.
    files: ['apps/**/*.ts', 'apps/**/*.tsx'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: 'Program',
          message:
            'batch_*_implementations.ts / batch_*_*.ts dump files are not allowed under apps/. Move real code into its feature module with real tests.',
        },
      ],
    },
  },
];