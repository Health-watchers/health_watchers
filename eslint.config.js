// Root ESLint config for lint-staged
// Delegates to app-specific configs

export default [
  {
    ignores: ['**/dist/**', '**/node_modules/**', '**/.next/**', '**/coverage/**'],
  },
];
