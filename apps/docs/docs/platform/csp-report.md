---
title: CSP Reports
description: "Collects browser Content-Security-Policy violation reports for monitoring."
---

# CSP Reports

Collects browser Content-Security-Policy violation reports for monitoring.

| | |
|---|---|
| **Base path** | `/api/v1/csp-report` |
| **Source** | [`apps/api/src/modules/security/csp-report.controller.ts`](https://github.com/Health-watchers/health_watchers/blob/main/apps/api/src/modules/security/csp-report.controller.ts) |

## Data model

- No dedicated model; reports are logged

## Key endpoints

| Method | Path | Roles |
|--------|------|-------|
| `POST` | `/api/v1/csp-report` | Public |

## Roles

- **Authenticated** means any signed-in user. Handlers still scope data to the caller's clinic (and to the caller's own records for `PATIENT` users).
- **Public** means the route has no session guard. It is either intentionally public or authenticated by other means, such as a signature, token, or API key.
