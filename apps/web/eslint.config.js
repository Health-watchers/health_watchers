import baseConfig from '@health-watchers/config/eslint-config';
import jsxA11y from 'eslint-plugin-jsx-a11y';

// Auth tokens (accessToken / refreshToken) are served exclusively as httpOnly
// cookies by the BFF (lib/authProxy.ts). Reading or writing them to Web Storage
// reintroduces an XSS-stealable token store — these selectors make that mistake
// fail the lint build instead of silently shipping an empty Bearer header.
const noAuthTokensInWebStorage = [
  {
    selector: "CallExpression[callee.property.name='getItem'][arguments.0.value='accessToken']",
    message:
      "Do not read 'accessToken' from Web Storage — it is an httpOnly cookie set by the BFF. Use apiV1Fetch / fetchWithAuth (credentials: 'include').",
  },
  {
    selector: "CallExpression[callee.property.name='setItem'][arguments.0.value='accessToken']",
    message: "Do not store 'accessToken' in Web Storage — keep it in the httpOnly cookie set by the BFF.",
  },
  {
    selector: "CallExpression[callee.property.name='getItem'][arguments.0.value='refreshToken']",
    message:
      "Do not read 'refreshToken' from Web Storage — it is an httpOnly cookie set by the BFF. Use apiV1Fetch / fetchWithAuth (credentials: 'include').",
  },
  {
    selector: "CallExpression[callee.property.name='setItem'][arguments.0.value='refreshToken']",
    message: "Do not store 'refreshToken' in Web Storage — keep it in the httpOnly cookie set by the BFF.",
  },
];

export default [
  ...baseConfig,
  {
    // Web: React accessibility rules
    plugins: { 'jsx-a11y': jsxA11y },
    rules: {
      ...jsxA11y.configs.recommended.rules,
      'no-restricted-syntax': ['error', ...noAuthTokensInWebStorage],
    },
    ignores: ['dist/**', 'node_modules/**', '.next/**'],
  },
];
