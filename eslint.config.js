// Root ESLint config — delegates to per-package configs via extends
// Also used by lint-staged for pre-commit checks

export default [
  {
    ignores: ['**/dist/**', '**/node_modules/**', '**/.next/**', '**/coverage/**'],
  },
];
