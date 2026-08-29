# Mutation Testing — Best Practices for Killing Mutants

This guide explains how to write tests that reliably kill mutants. Each section maps a Stryker mutator type to the test patterns that defeat it, with concrete examples drawn from this codebase.

---

## Core principle

Coverage is not enough. A test that executes a line but never asserts its output will be covered but will not kill mutations on that line. Every assertion must be **specific enough to break when the code changes**.

```ts
// ❌ Passes even if the condition is flipped to `true`
expect(result).toBeTruthy();

// ✅ Breaks when the boundary condition is mutated
expect(result).toBe(false);
expect(result).toStrictEqual({ allowed: false, reason: 'expired' });
```

---

## ConditionalExpression mutants

Stryker replaces `condition` with `true` and with `false` independently. Both replacements must be caught by different test cases.

**Pattern:** test the **exact boundary value** from both sides.

```ts
// utils/paginate.ts — offset + limit <= total
// Mutant: replaced condition with true  → surviving if no test has offset+limit > total
// Mutant: replaced condition with false → surviving if no test has offset+limit <= total

it('returns a full page when items remain', () => {
  expect(paginate({ total: 100, page: 1, limit: 10 })).toMatchObject({
    hasNextPage: true,
    totalPages: 10,
  });
});

it('returns last page when offset reaches total', () => {
  expect(paginate({ total: 10, page: 1, limit: 10 })).toMatchObject({
    hasNextPage: false,
    totalPages: 1,
  });
});

it('clamps when offset exceeds total', () => {
  expect(paginate({ total: 5, page: 2, limit: 10 })).toMatchObject({
    hasNextPage: false,
    items: [],
  });
});
```

**Rule:** for every `if (a > b)`, write one test where `a > b` is true and one where it is false. For `>=` boundaries, also test the exact equal case.

---

## EqualityOperator mutants

Stryker swaps `===` with `!==`, `==` with `!=`, etc. Tests must assert both the passing and failing cases.

```ts
// modules/auth/jwt-claim-validator.ts — role === 'admin'
it('allows access for admin role', () => {
  expect(validateClaims({ role: 'admin' })).toBe(true);
});

it('denies access for non-admin role', () => {
  expect(validateClaims({ role: 'user' })).toBe(false);
  expect(validateClaims({ role: '' })).toBe(false);
});
```

**Rule:** never test only the happy path. Always include at least one test where the equality check should evaluate to false.

---

## LogicalOperator mutants

Stryker replaces `&&` with `||` and vice versa. The only way to kill both is to test each operand independently.

```ts
// auth.middleware — isAuthenticated && hasRequiredRole
it('denies when authenticated but wrong role', () => {
  // && → || would incorrectly allow this through
  const res = await request(app)
    .get('/admin')
    .set('Authorization', validUserToken);
  expect(res.status).toBe(403);
});

it('denies when correct role but not authenticated', () => {
  // || → && would incorrectly deny this case
  const res = await request(app).get('/admin');
  expect(res.status).toBe(401);
});

it('allows when both conditions are met', () => {
  const res = await request(app)
    .get('/admin')
    .set('Authorization', validAdminToken);
  expect(res.status).toBe(200);
});
```

**Rule:** for every `A && B`, write three tests: A true + B false, A false + B true, both true. For `A || B`: both false, A true + B false, A false + B true.

---

## ArithmeticOperator mutants

Stryker swaps `+`, `-`, `*`, `/`. Tests must assert the **computed value precisely**, not just that a result exists.

```ts
// utils/paginate.ts — skip = (page - 1) * limit
it('computes correct skip for page 3 limit 10', () => {
  const { skip } = paginate({ page: 3, limit: 10, total: 100 });
  expect(skip).toBe(20); // not toBeTruthy()
});

it('computes zero skip for first page', () => {
  const { skip } = paginate({ page: 1, limit: 10, total: 100 });
  expect(skip).toBe(0);
});
```

**Rule:** use exact numeric assertions. Avoid `toBeGreaterThan(0)` when you know the exact expected value.

---

## BlockStatement mutants

Stryker removes entire blocks (the body of an `if`, a `try`, a `catch`). Tests must verify the **observable side-effect** of that block executing.

```ts
// services/token-denylist.service.ts — adds token to denylist on logout
it('adds token to denylist after logout', async () => {
  await authService.logout(accessToken);
  // Verify the block actually ran — not just that logout didn't throw
  const isDenied = await tokenDenylistService.isDenied(accessToken);
  expect(isDenied).toBe(true);
});
```

**Rule:** after calling a method, assert the state it was supposed to change, not just that it returned without error.

---

## BooleanLiteral mutants

Stryker flips `true` to `false` and vice versa. Tests must verify behaviour changes when the flag changes.

```ts
// modules/auth/services/backup-code.service.ts — isUsed: false on generation
it('marks backup codes as unused on generation', async () => {
  const codes = await backupCodeService.generate(userId);
  for (const code of codes) {
    expect(code.isUsed).toBe(false); // not toBeFalsy()
  }
});

it('marks backup code as used after consumption', async () => {
  await backupCodeService.consume(userId, validCode);
  const code = await backupCodeService.findCode(userId, validCode);
  expect(code.isUsed).toBe(true);
});
```

---

## StringLiteral mutants

Stryker replaces string values with empty strings or other strings. Tests must assert on **exact string content** — error messages, type codes, field names.

```ts
// utils/app-error.ts — errorType: 'VALIDATION_ERROR'
it('sets errorType to VALIDATION_ERROR', () => {
  const err = new AppError('Invalid input', 400, 'VALIDATION_ERROR');
  expect(err.errorType).toBe('VALIDATION_ERROR'); // exact string
  expect(err.message).toBe('Invalid input');       // not .toContain()
});
```

**Rule:** assert on `message`, `code`, `type`, and `name` properties of errors. Use `toBe` not `toContain` where the full value is known.

---

## UpdateOperator mutants

Stryker replaces `++` with `--` and swaps pre/post increment. Tests must verify counter values at specific points, especially boundaries.

```ts
// Hypothetical retry loop — retryCount++
it('increments retry count on each attempt', async () => {
  const spy = jest.spyOn(service, 'attempt');
  await service.runWithRetry({ maxRetries: 3 });
  expect(spy).toHaveBeenCalledTimes(3);
});

it('stops exactly at maxRetries', async () => {
  jest.spyOn(service, 'attempt').mockRejectedValue(new Error('fail'));
  await expect(service.runWithRetry({ maxRetries: 2 })).rejects.toThrow();
  // exactly 2 attempts, not 1 or 3
  expect(spy).toHaveBeenCalledTimes(2);
});
```

---

## OptionalChaining mutants

Stryker removes `?.` so `a?.b` becomes `a.b`. Tests must cover the `null`/`undefined` path explicitly.

```ts
it('handles missing nested field gracefully', () => {
  const result = validateClaims({ user: null });
  expect(result.valid).toBe(false); // not undefined, not thrown
});

it('reads nested field when present', () => {
  const result = validateClaims({ user: { role: 'admin' } });
  expect(result.valid).toBe(true);
});
```

---

## Patterns to avoid

| Anti-pattern | Why it fails to kill mutants |
|---|---|
| `expect(fn()).toBeTruthy()` | Passes for any non-null return; won't detect flipped boolean |
| `expect(fn()).not.toThrow()` | Says nothing about the return value |
| Only testing the happy path | Leaves all conditional mutations on the false branch alive |
| Snapshot testing complex objects | Snapshots catch unintended changes but miss targeted mutations |
| Mocking the function under test | The mock runs instead of the mutated code |
| `toBeGreaterThan(0)` on a known value | Won't detect off-by-one arithmetic mutations |

---

## Checklist before marking a test complete

- [ ] Does the test fail if the condition is flipped?
- [ ] Does the test fail if the arithmetic operand changes?
- [ ] Does the test fail if the block is removed entirely?
- [ ] Are all assertions using exact values where the value is known?
- [ ] Is the null/undefined path tested alongside the happy path?
- [ ] Are error `message` and `type` properties asserted, not just the throw?

---

## Disabling a mutant (last resort)

When a mutant is genuinely untestable (e.g. a defensive `|| []` fallback that is never reachable), suppress it with an inline comment:

```ts
// Stryker disable next-line ArrayDeclaration: defensive fallback, unreachable in practice
const items = data.items || [];
```

Use `// Stryker disable` sparingly. Every suppression should have a justification comment. Suppressed mutants are tracked in the `Ignored` count in the report.
