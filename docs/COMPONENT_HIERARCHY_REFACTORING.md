# Component Hierarchy and Props Refactoring

> Tracking issue: #1288 — [Refactoring] Refactor component hierarchy and props

## Overview

`apps/web/src/components` is organized by domain (`patients/`, `encounters/`,
`payments/`, `appointments/`, `dashboard/`, `compliance/`, `forms/`, `ui/`,
etc.), with cross-cutting state currently handled by five React contexts in
`apps/web/src/context/` (`AuthContext`, `ActivityFeedContext`,
`CollaborationContext`, `NotificationContext`, `PresenceContext`) and a
`hooks/` directory that's thin relative to the number of domain components
(`useAsyncError`, `useFeeEstimate`, `useNotifications`, `usePWA`,
`usePatientDetail`, realtime hooks).

That shape suggests the likely problems this issue is meant to catch:

- Domain components mixing data-fetching/business logic with presentation,
  making them hard to reuse or test in isolation.
- Prop drilling from route-level pages down through several domain component
  layers instead of consuming context or a hook directly.
- Logic duplicated across domain folders (e.g. patient detail logic in
  `usePatientDetail.ts` not mirrored by equivalent hooks for encounters,
  appointments, etc.) instead of extracted once.

## Goal

A component tree where presentational components are reusable across
domains, business/data logic lives in hooks (not JSX), props are fully typed,
and re-renders are intentional rather than incidental.

## Task breakdown

1. **Audit component hierarchy** — map `apps/web/src/components/**` by
   responsibility: pure presentational vs. container (data-fetching,
   mutation, context-consuming) vs. page-level (`apps/web/src/app/**`).
   Flag components mixing both.
2. **Extract presentational components** — pull pure-render pieces out of
   container components identified in (1) into `components/ui/` (which
   already holds shared primitives) so they're reusable outside their
   original domain folder.
3. **Implement prop validation with TypeScript** — ensure every component
   props type is an explicit `interface`/`type` (not `any` / implicit), reusing
   shared domain types from `apps/web/src/types` and `apps/web/src/contracts`
   rather than redeclaring shapes inline.
4. **Remove prop drilling** — for props threaded through more than one
   intermediate component only to reach a descendant, replace with the
   relevant context (`AuthContext`, `NotificationContext`, etc.) or a hook,
   per case.
5. **Implement context providers** — for cross-cutting state not yet in a
   context (if the audit in (1) finds any), add one following the existing
   pattern in `apps/web/src/context/`; avoid adding a context for state only
   one subtree needs.
6. **Create custom hooks for logic** — extract data-fetching/business logic
   out of components into hooks alongside `usePatientDetail.ts`,
   `useFeeEstimate.ts`, etc., so container components become thin.
7. **Optimize re-renders** — audit context providers and large domain
   components for unnecessary re-renders (missing `useMemo`/`useCallback`,
   context value objects recreated on every render, components subscribing to
   more context than they use).
8. **Implement component composition patterns** — prefer children/render-prop
   composition over boolean prop flags that branch internal rendering, where
   it reduces prop surface area.
9. **Create component usage guide** — short reference (can live alongside
   this doc or in `apps/web/src/components/ui/README.md`) showing how to
   compose the shared `ui/` primitives for common layouts.
10. **Document component APIs** — prop-level documentation for shared
    components (JSDoc on the props interface is sufficient; avoid
    duplicating what TypeScript already expresses).

## Acceptance criteria

- Components reusable across app — presentational components in `ui/` have
  no domain-specific data-fetching baked in.
- Props clearly typed — no `any`, no untyped object props, shared types
  reused from `types/`/`contracts/`.
- Re-renders optimized — context values and expensive computations in
  frequently-rendered components are memoized.
- Testing improved — presentational components are testable without mocking
  a domain context/hook; container logic is testable via its extracted hook
  independent of JSX.

## Non-goals

- A framework or state-management migration (e.g. away from React Context) —
  this is a structural cleanup within the current architecture.
