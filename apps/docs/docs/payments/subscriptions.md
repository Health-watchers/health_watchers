---
title: Subscriptions
description: "The clinic's platform subscription: tiers, usage metering, upgrades and cancellation, subscription payments, platform invoicing, and suspension of overdue clinics."
---

# Subscriptions

The clinic's platform subscription: tiers, usage metering, upgrades and cancellation, subscription payments, platform invoicing, and suspension of overdue clinics.

| | |
|---|---|
| **Base path** | `/api/v1/subscriptions` |
| **Source** | [`apps/api/src/modules/subscriptions/subscriptions.controller.ts`](https://github.com/Health-watchers/health_watchers/blob/main/apps/api/src/modules/subscriptions/subscriptions.controller.ts) |

## Data model

- Subscription (`subscription.model.ts`)
- UsageRecord (`usage.model.ts`)

## Key endpoints

| Method | Path | Roles |
|--------|------|-------|
| `GET` | `/api/v1/subscriptions/usage` | Authenticated |
| `GET` | `/api/v1/subscriptions/me` | Authenticated |
| `POST` | `/api/v1/subscriptions` | `SUPER_ADMIN`, `ADMIN` |
| `PUT` | `/api/v1/subscriptions/me/tier` | `SUPER_ADMIN`, `ADMIN` |
| `PUT` | `/api/v1/subscriptions/me/cancel` | `SUPER_ADMIN`, `ADMIN` |
| `POST` | `/api/v1/subscriptions/me/payment` | `SUPER_ADMIN`, `ADMIN` |
| `POST` | `/api/v1/subscriptions/billing/invoice` | `SUPER_ADMIN` |
| `POST` | `/api/v1/subscriptions/billing/suspend-overdue` | `SUPER_ADMIN` |
| `GET` | `/api/v1/subscriptions/tiers` | Public |

## Roles

Roles referenced by this module: `ADMIN`, `SUPER_ADMIN`.

- **Authenticated** means any signed-in user. Handlers still scope data to the caller's clinic (and to the caller's own records for `PATIENT` users).
- **Public** means the route has no session guard. It is either intentionally public or authenticated by other means, such as a signature, token, or API key.
