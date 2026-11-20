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
  {
    // Controllers should stay small: parse/validate requests and delegate to services.
    // Warn (not error) so oversized controllers are flagged without breaking the build.
    files: ['**/*.controller.ts'],
    rules: {
      'max-lines': [
        'warn',
        { max: 500, skipBlankLines: true, skipComments: true },
      ],
    },
  },
];