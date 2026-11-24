# Dependency Injection

> Tracking issue: #1287 — [Refactoring] Implement dependency injection pattern

## Overview

`apps/api` currently has no DI container — a repo-wide search for
`inversify`, `tsyringe`, or an `@injectable`/`container.register` pattern
turns up nothing. Services under `apps/api/src/modules/**/*.service.ts` and
`apps/api/src/services/` are plain classes or modules that import their
dependencies (database models, other services, config, external clients)
directly at the top of the file. That's simple, but it means:

- Unit tests for a service can't substitute a fake dependency without
  `jest.mock()`'ing the imported module path, which is brittle and hides the
  service's real dependency list.
- Swapping an implementation (e.g. a payment gateway client, a notification
  provider) means editing every import site instead of one registration.
- Module boundaries aren't enforced — any file can reach into another
  module's internals via a direct import instead of an injected interface.

This is a genuine introduction of a new pattern, not a consolidation of
existing infrastructure (unlike #1289/#1290) — treat the plan below as a
proposal to validate with the team before large-scale service refactors
begin.

## Goal

Services declare their dependencies through constructor injection against
interfaces, resolved by a container at the composition root (app startup /
route registration), so tests can inject fakes and implementations can be
swapped without touching call sites.

## Proposed approach

Given `apps/api` is a TypeScript Express codebase already using decorators
sparingly, two realistic options:

| Option | Pros | Cons |
|---|---|---|
| `tsyringe` (Microsoft) | Lightweight, decorator-based, minimal boilerplate, good fit for adding DI incrementally to an existing codebase | Requires `reflect-metadata`, decorator metadata enabled in `tsconfig` |
| Manual constructor injection + hand-written composition root (no library) | Zero new dependency, fully explicit, easiest to review | More boilerplate at the composition root as services grow; no built-in lifecycle management |

Recommendation: start with manual constructor injection for new/refactored
services (no library risk, no decorator/tsconfig changes), and revisit
`tsyringe` only if the manual composition root becomes unwieldy. This should
be confirmed with the team before implementation, since it affects every
service file.

## Task breakdown

1. **Create DI container setup** — decide library vs. manual approach (see
   above); if manual, build a small composition root module (e.g.
   `apps/api/src/container.ts`) that constructs services with their
   dependencies and exports the instances routes consume.
2. **Implement service registration** — register each service's concrete
   implementation against an interface it satisfies, starting with services
   that currently have the most test friction (payment, notifications,
   auth).
3. **Refactor services to use DI** — convert direct top-of-file imports in
   `apps/api/src/modules/**/*.service.ts` to constructor parameters, module
   by module, starting with the pilot set from (2).
4. **Remove global state dependencies** — identify singletons/module-level
   mutable state (e.g. shared caches, in-memory maps) accessed directly
   rather than injected, and route them through the container instead.
5. **Implement mock services for testing** — for each interface introduced in
   (2), provide a test double under `apps/api/src/__mocks__/` or
   `__tests__/factories/`, replacing existing `jest.mock()` module mocks
   where the service has been converted.
6. **Create DI configuration documentation** — expand this doc with the final
   library/pattern decision and a "how to add a new injectable service"
   walkthrough once (1)–(3) land for the pilot modules.
7. **Add DI validation** — ensure missing/misconfigured registrations fail
   fast at startup (composition root throws immediately) rather than
   surfacing as a runtime `undefined` deep in a request handler.
8. **Implement service lifecycle management** — decide singleton vs.
   per-request scope per service (e.g. a DB-backed repository can be a
   singleton; a per-request audit context should not be), and encode that in
   the registration.
9. **Add DI best practices guide** — short guide (interface-first, no
   service-locator anti-pattern, constructor injection only) to prevent the
   pattern from degrading as more services adopt it.
10. **Refactor API routes to use DI** — update route handlers in
    `apps/api/src/routes/**` to pull services from the container/composition
    root instead of importing service singletons directly.

## Acceptance criteria

- All services injectable — service classes take their dependencies as
  constructor parameters, not top-level imports.
- Testing improved — unit tests inject fakes/mocks through the constructor
  instead of `jest.mock()`'ing import paths.
- Coupling reduced — modules depend on interfaces, not concrete
  implementations of other modules.
- Documentation complete — this doc reflects the adopted pattern and shows
  how to register a new service.

## Open question for the team

Manual injection vs. `tsyringe` (or another lightweight container) — needs a
decision before (1)–(3) proceed at scale, since reverting a library choice
after many services adopt it is expensive.
