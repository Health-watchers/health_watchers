---
title: Webhooks
description: "Outbound webhook subscriptions with signed deliveries, delivery history, retries, and test events."
---

# Webhooks

Outbound webhook subscriptions with signed deliveries, delivery history, retries, and test events. Also receives inbound Stellar payment webhooks (`/webhooks/stellar`, `/webhooks/stellar-payment`), which are verified by signature rather than a user session.

| | |
|---|---|
| **Base path** | `/api/v1/webhooks` |
| **Source** | [`apps/api/src/modules/webhooks/webhooks.controller.ts`](https://github.com/Health-watchers/health_watchers/blob/main/apps/api/src/modules/webhooks/webhooks.controller.ts) |

## Data model

- Webhook (`webhook.model.ts`): URL, events, secret, deliveries

## Key endpoints

| Method | Path | Roles |
|--------|------|-------|
| `POST` | `/api/v1/webhooks/stellar` | Public |
| `POST` | `/api/v1/webhooks/stellar-payment` | Public |
| `POST` | `/api/v1/webhooks` | `CLINIC_ADMIN`, `SUPER_ADMIN` |
| `GET` | `/api/v1/webhooks` | `CLINIC_ADMIN`, `SUPER_ADMIN` |
| `GET` | `/api/v1/webhooks/events` | `CLINIC_ADMIN`, `SUPER_ADMIN` |
| `GET` | `/api/v1/webhooks/:id` | `CLINIC_ADMIN`, `SUPER_ADMIN` |
| `PATCH` | `/api/v1/webhooks/:id` | `CLINIC_ADMIN`, `SUPER_ADMIN` |
| `DELETE` | `/api/v1/webhooks/:id` | `CLINIC_ADMIN`, `SUPER_ADMIN` |
| `GET` | `/api/v1/webhooks/:id/deliveries` | `CLINIC_ADMIN`, `SUPER_ADMIN` |
| `GET` | `/api/v1/webhooks/:id/deliveries/:deliveryId` | `CLINIC_ADMIN`, `SUPER_ADMIN` |
| `POST` | `/api/v1/webhooks/:id/test` | `CLINIC_ADMIN`, `SUPER_ADMIN` |
| `POST` | `/api/v1/webhooks/:id/deliveries/:deliveryId/retry` | `CLINIC_ADMIN`, `SUPER_ADMIN` |
| `GET` | `/api/v1/webhooks/:id/events` | `CLINIC_ADMIN`, `SUPER_ADMIN` |
| `GET` | `/api/v1/webhooks/stats/overview` | `CLINIC_ADMIN`, `SUPER_ADMIN` |

## Roles

Roles referenced by this module: `CLINIC_ADMIN`, `SUPER_ADMIN`.

- **Authenticated** means any signed-in user. Handlers still scope data to the caller's clinic (and to the caller's own records for `PATIENT` users).
- **Public** means the route has no session guard. It is either intentionally public or authenticated by other means, such as a signature, token, or API key.
