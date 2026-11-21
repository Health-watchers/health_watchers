import baseConfig from '@health-watchers/config/eslint-config';

export default [
  ...baseConfig,
  {
    // API-specific overrides: stricter than the shared config — no console.log
    // (use the logger) and explicit return types are required.
    rules: {
      'no-console': 'error',
      '@typescript-eslint/explicit-function-return-type': 'error',
    },
  },
  {
    // Tenant scoping: forbid fetching records straight from URL params by ID in
    // controllers. Use the shared `findScoped(Model, id, req.user)` helper so
    // every lookup is clinic-scoped. See issue #1771.
    files: ['**/modules/**/*.controller.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector:
            "CallExpression[callee.property.name='findById'][arguments.0.type='MemberExpression'][arguments.0.object.name='req'][arguments.0.property.name='params']",
          message:
            'Do not call findById(req.params.*) directly in controllers — it bypasses tenant scoping. Use the shared findScoped(Model, id, req.user) helper instead (see #1771).',
        },
        {
          selector:
            "CallExpression[callee.property.name='findByIdAndUpdate'][arguments.0.type='MemberExpression'][arguments.0.object.name='req'][arguments.0.property.name='params']",
          message:
            'Do not call findByIdAndUpdate(req.params.*) directly in controllers — it writes before any ownership check. Use the shared findScoped(Model, id, req.user) helper before updating (see #1771).',
        },
      ],
    },
  },
];