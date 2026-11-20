// Root ESLint config — delegates to per-package configs via extends
// Also used by lint-staged for pre-commit checks

export default [
  {
    ignores: ['**/dist/**', '**/node_modules/**', '**/.next/**', '**/coverage/**'],
  },
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