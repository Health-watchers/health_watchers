// @ts-check
import tseslint from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';
import security from 'eslint-plugin-security';
import prettier from 'eslint-config-prettier';

/** @type {import('eslint').Linter.FlatConfig[]} */
const baseConfig = [
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
      },
    },
    plugins: {
      '@typescript-eslint': tseslint,
      security,
    },
    rules: {
      // TypeScript-ESLint recommended rules
      ...tseslint.configs.recommended.rules,

      // Security plugin rules
      ...security.configs.recommended.rules,
      'security/detect-object-injection': 'error',
      'security/detect-non-literal-regexp': 'error',

      // TypeScript strictness — warn not error to allow gradual adoption
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-non-null-assertion': 'warn',
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],

      // General safety
      'no-console': 'warn',
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-unused-vars': 'off', // Handled by @typescript-eslint/no-unused-vars
    },
  },
  // Must be last — disables ESLint rules that conflict with Prettier
  prettier,
  {
    ignores: ['dist/**', 'node_modules/**', 'coverage/**'],
  },
];

export default baseConfig;
