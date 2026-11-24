---
title: Cache Administration
description: "Redis cache metrics, debugging, entry listing, and targeted eviction or full clears."
---

# Cache Administration

Redis cache metrics, debugging, entry listing, and targeted eviction or full clears.

| | |
|---|---|
| **Base path** | `/api/v2/cache` |
| **Source** | [`apps/api/src/modules/caching/cache-debug.controller.ts`](https://github.com/Health-watchers/health_watchers/blob/main/apps/api/src/modules/caching/cache-debug.controller.ts) |

## Data model

- Redis keyspace

## Key endpoints

| Method | Path | Roles |
|--------|------|-------|
| `GET` | `/api/v2/cache/metrics` | `admin` |
| `GET` | `/api/v2/cache/debug` | `admin` |
| `GET` | `/api/v2/cache/entries` | `admin` |
| `POST` | `/api/v2/cache/clear` | `admin` |
| `POST` | `/api/v2/cache/evict` | `admin` |

## Roles

Roles referenced by this module: `admin`.

- **Authenticated** means any signed-in user. Handlers still scope data to the caller's clinic (and to the caller's own records for `PATIENT` users).
- **Public** means the route has no session guard. It is either intentionally public or authenticated by other means, such as a signature, token, or API key.
