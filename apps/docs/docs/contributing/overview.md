---
title: Contributing Overview
description: How to contribute code and documentation to Health Watchers.
---

# Contributing Overview

The full contribution guide is [`CONTRIBUTING.md`](https://github.com/Health-watchers/health_watchers/blob/main/CONTRIBUTING.md). It covers development setup, branch naming, quality gates, coding standards, testing, Conventional Commit messages, and dependency policy.

## Quick reference

1. Fork the repository and add `upstream`: `https://github.com/Health-watchers/health_watchers.git`.
2. Create a branch such as `feat/<issue>-short-description` or `docs/<issue>-short-description`.
3. Run `npm run lint`, `npm run typecheck` and `npm test` before pushing.
4. Write the PR title in Conventional Commit form, for example `docs(site): add module guides`.

## Where things live

| Area | Location |
|------|----------|
| REST API | `apps/api/src/modules/<module>/` |
| Web app | `apps/web/src/app/` |
| Mobile app | `apps/mobile/` |
| Stellar service | `apps/stellar-service/` |
| Documentation site | `apps/docs/` |
| Engineering docs | `docs/` (see [Engineering Docs Index](./engineering-docs.md)) |
| Shared packages | `packages/types`, `packages/config`, `packages/anonymize` |

See also: [Writing Documentation](./writing-docs.md), [Security policy](https://github.com/Health-watchers/health_watchers/blob/main/SECURITY.md).
