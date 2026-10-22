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
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],

      // General safety
      'no-console': 'warn',
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-unused-vars': 'warn',
    },
  },
  // Type-aware rules (issue #1644). `projectService` picks up each package's
  // own tsconfig.json automatically, so no explicit `project` path is needed
  // here. This has not been run against the full monorepo — it hasn't been
  // possible to run ESLint to see the fallout as part of this change — so
  // expect real findings the first time CI runs it. Tune individual rules
  // down to `warn` then, the same way the rules above already are, rather
  // than disabling this wholesale if it's too noisy at first.
  ...tseslint.configs['flat/recommended-type-checked'].map((config) => ({
    ...config,
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      ...config.languageOptions,
      parserOptions: {
        ...config.languageOptions?.parserOptions,
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  })),
  // Must be last — disables ESLint rules that conflict with Prettier
  prettier,
  {
    ignores: ['dist/**', 'node_modules/**', 'coverage/**'],
  },
];

export default baseConfig;
