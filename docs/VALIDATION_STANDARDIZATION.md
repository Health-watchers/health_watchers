# Validation Standardization

> Tracking issue: #1290 — [Refactoring] Standardize data validation

## Overview

Validation logic in Health Watchers is currently split across three layers that
don't share rules:

- **API** (`apps/api`): ad hoc `zod` schemas per module, plus a small shared
  set in [`apps/api/src/shared/validation/validators.ts`](../apps/api/src/shared/validation/validators.ts)
  and [`common-schemas.ts`](../apps/api/src/shared/validation/common-schemas.ts).
- **Web** (`apps/web`): `react-hook-form` + `@hookform/resolvers`, with forms
  under `apps/web/src/components/forms` frequently redefining rules (email,
  phone, monetary amount, ICD-10/CPT codes) that already exist on the API
  side.
- **Contracts** (`apps/api/src/contracts`, `apps/web/src/contracts`): Pact
  contract tests assert shapes but don't share a validation source of truth
  with either runtime.

The result: the same field (e.g. a phone number or a CPT code) can pass
validation in the UI and fail in the API, or vice versa, because the regexes
drifted independently.

## Goal

One set of validation rules, defined once, consumed by the API, the web
forms, and (where practical) contract tests — so "valid" means the same thing
everywhere.

## Current state (audit)

| Layer | Mechanism | Location |
|---|---|---|
| API request validation | `zod` schemas, applied per-route or per-module | `apps/api/src/modules/*/`, `apps/api/src/shared/validation/` |
| API shared primitives | `zod` reusable fields (`emailField`, `phoneField`, `monetaryAmount`, `icd10Code`, `cptCode`, `mongoObjectId`, `stellarPublicKey`) | `apps/api/src/shared/validation/validators.ts` |
| Web form validation | `react-hook-form` + `@hookform/resolvers/zod` | `apps/web/src/components/forms/*` |
| Error surfacing | `ZodError` handled in `error.middleware.ts`, mapped via `error-taxonomy.ts` | `apps/api/src/middlewares/error.middleware.ts`, `apps/api/src/utils/error-taxonomy.ts` |

The API already standardized on `zod`, and the web app already depends on the
same library through `@hookform/resolvers`. That means this is a
**consolidation** effort, not a tooling migration: the primitives in
`validators.ts` need to move somewhere both apps can import from, and web
forms need to be audited for rules that duplicate (and may have drifted from)
those primitives.

## Task breakdown

1. **Audit existing validation code** — inventory every `zod` schema in
   `apps/api/src/modules/**` and every `react-hook-form` resolver in
   `apps/web/src/components/forms/**`; flag fields validated in more than one
   place with inconsistent rules (start with email, phone, monetary amount,
   ICD-10, CPT, MongoDB ObjectId, Stellar public key — these already have a
   canonical definition in `validators.ts` that other call sites may not use).
2. **Implement shared validation rules** — move `apps/api/src/shared/validation/`
   into a package both `apps/api` and `apps/web` can import (e.g.
   `packages/validation`, consistent with how `packages/` already hosts
   `@health-watchers/types`), and update `apps/web` forms to import from it
   instead of redefining regexes.
3. **Create validation schema definitions** — one `zod` schema per domain
   entity (patient, encounter, medication, invoice, appointment, etc.),
   composed from the shared primitives, used as the single source for both
   the API route validator and the web form resolver.
4. **Implement form validation** — wire every form in
   `apps/web/src/components/forms` through `zodResolver(schema)` using the
   shared schemas from (3), replacing any hand-rolled validation.
5. **Add API validation** — ensure every mutating route (`POST`/`PUT`/`PATCH`)
   validates its body/query/params against the shared schema before it
   reaches a service, not inside the service.
6. **Create validation error formatting** — normalize `ZodError.issues` into
   the existing `ApiErrorCode.VALIDATION_ERROR` / `ErrorCategory.VALIDATION`
   shape already defined in `error-taxonomy.ts`, with a field-path → message
   map the web client can bind directly to form fields.
7. **Implement async validation** — support server-side checks that can't run
   client-side (uniqueness of email/NPI/license number, referenced-record
   existence) as `zod` `.refine`/`.superRefine` async validators, invoked from
   both the API route and, where applicable, an on-blur web form check.
8. **Add custom validation rules** — domain-specific rules that aren't plain
   regex/range checks (ICD-10/CPT code cross-checks, insurance policy number
   formats per provider, medication dosage bounds) as named, reusable `zod`
   refinements alongside the primitives in (2).
9. **Create validation testing** — unit tests per shared schema (valid/invalid
   fixtures), plus a contract test asserting the API rejects anything the
   shared schema would reject, so drift between layers fails CI.
10. **Document validation approach** — this document, kept current as the
    shared package lands; link it from `CONTRIBUTING.md`.

## Acceptance criteria

- Validation is consistent everywhere — the same schema (or a schema composed
  from the same primitives) validates a given field on the API and in the
  corresponding web form.
- Invalid data cannot be saved — every mutating API route validates before
  persisting, with no service-layer bypass.
- Validation errors are user-friendly — field-level messages, not raw `zod`
  issue dumps, surfaced through the existing error-taxonomy pipeline.
- Validation is easily extended — adding a new field means adding one schema
  fragment, consumed by both layers, not editing two independent regexes.

## Non-goals

- Replacing `zod` with a different validation library.
- Changing existing valid API contracts/response shapes (Pact tests must keep
  passing).
