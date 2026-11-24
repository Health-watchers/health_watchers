---
title: Research Export
description: "De-identified research dataset export."
---

# Research Export

De-identified research dataset export.

| | |
|---|---|
| **Base path** | `/api/v1/research` |
| **Source** | [`apps/api/src/modules/research/research.routes.ts`](https://github.com/Health-watchers/health_watchers/blob/main/apps/api/src/modules/research/research.routes.ts) |

## Data model

- No dedicated model; reads anonymised clinical data through `packages/anonymize`

## Key endpoints

| Method | Path | Roles |
|--------|------|-------|
| `GET` | `/api/v1/research/export` | Authenticated |

## Roles

- **Authenticated** means any signed-in user. Handlers still scope data to the caller's clinic (and to the caller's own records for `PATIENT` users).
- **Public** means the route has no session guard. It is either intentionally public or authenticated by other means, such as a signature, token, or API key.

:::note

All routes require authentication and the `SUPER_ADMIN` role (`requireSuperAdmin`).

:::
