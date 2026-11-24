// @ts-check
//
// Canonical ESLint flat config for the whole monorepo (issues #1677, #1678).
//
// Every app/package should import this module and extend it rather than
// declaring its own rules from scratch:
//
//   import { defineConfig } from '@repo/eslint-config';
//   export default defineConfig({
//     overrides: [ /* app-specific config objects */ ],
//   });
//
// App-specific overrides should only cover framework/plugin specifics; shared
// rules (security, TypeScript strictness, logging) live here.
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
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-unused-vars': 'warn',
    },
  },
  // Structured logging (issue #1678): ban console.* in production code.
  // Tests, scripts, tooling and config files are exempted below.
  {
    files: ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx', '**/*.mjs', '**/*.cjs'],
    rules: {
      'no-console': 'error',
    },
  },
  {
    files: [
      '**/*.test.ts',
      '**/*.test.tsx',
      '**/*.spec.ts',
      '**/*.spec.tsx',
      '**/__tests__/**',
      '**/__mocks__/**',
      '**/test/**',
      '**/tests/**',
      '**/scripts/**',
      '**/*.config.{js,cjs,mjs,ts}',
      '**/.eslintrc.{js,cjs}',
    ],
    rules: {
      'no-console': 'off',
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
    ignores: ['dist/**', 'build/**', 'node_modules/**', 'coverage/**', '.next/**'],
  },
];

/**
 * Build an app/package ESLint config that extends the shared base config.
 *
 * @param {object} [options]
 * @param {import('eslint').Linter.FlatConfig[]} [options.overrides]
 *   App-specific config objects appended after the shared base. Use these only
 *   for framework/plugin specifics (e.g. React, Next.js, NestJS).
 * @param {import('eslint').Linter.FlatConfig[]} [options.prepend]
 *   Config objects inserted before the shared base (e.g. plugin registration
 *   that later overrides depend on).
 * @param {string[]} [options.ignores]
 *   Extra ignore patterns for this app.
 * @returns {import('eslint').Linter.FlatConfig[]}
 */
export function defineConfig({ overrides = [], prepend = [], ignores = [] } = {}) {
  /** @type {import('eslint').Linter.FlatConfig[]} */
  const config = [...prepend, ...baseConfig, ...overrides];

  if (ignores.length > 0) {
    config.push({ ignores });
  }

  return config;
}

export { baseConfig };
export default baseConfig;
