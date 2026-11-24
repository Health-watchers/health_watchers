---
title: Notifications
description: "In-app notifications with read state, per-user delivery preferences across channels, delivery tracking, and admin-managed templates and dispatch."
---

# Notifications

In-app notifications with read state, per-user delivery preferences across channels, delivery tracking, and admin-managed templates and dispatch.

| | |
|---|---|
| **Base path** | `/api/v1/notifications` |
| **Source** | [`apps/api/src/modules/notifications/notifications.controller.ts`](https://github.com/Health-watchers/health_watchers/blob/main/apps/api/src/modules/notifications/notifications.controller.ts)<br/>[`apps/api/src/modules/notifications/notification-admin.controller.ts`](https://github.com/Health-watchers/health_watchers/blob/main/apps/api/src/modules/notifications/notification-admin.controller.ts) |

## Data model

- Notification, NotificationDelivery, NotificationPreference, NotificationTemplate

## Key endpoints

| Method | Path | Roles |
|--------|------|-------|
| `GET` | `/api/v1/notifications` | Authenticated |
| `GET` | `/api/v1/notifications/unread-count` | Authenticated |
| `PUT` | `/api/v1/notifications/read-all` | Authenticated |
| `PUT` | `/api/v1/notifications/:id/read` | Authenticated |
| `DELETE` | `/api/v1/notifications/:id` | Authenticated |
| `GET` | `/api/v1/notifications/preferences` | Authenticated |
| `PUT` | `/api/v1/notifications/preferences` | Authenticated |
| `GET` | `/api/v1/notifications/deliveries` | Authenticated |
| `GET` | `/api/v1/notifications/:id/deliveries` | Authenticated |
| `GET` | `/api/v1/notifications/templates` | `SUPER_ADMIN`, `CLINIC_ADMIN`, `ADMIN` |
| `POST` | `/api/v1/notifications/templates` | `SUPER_ADMIN`, `CLINIC_ADMIN`, `ADMIN` |
| `PUT` | `/api/v1/notifications/templates/:id` | `SUPER_ADMIN`, `CLINIC_ADMIN`, `ADMIN` |
| `DELETE` | `/api/v1/notifications/templates/:id` | `SUPER_ADMIN`, `CLINIC_ADMIN`, `ADMIN` |
| `POST` | `/api/v1/notifications/dispatch` | `SUPER_ADMIN`, `CLINIC_ADMIN`, `ADMIN` |

## Roles

Roles referenced by this module: `ADMIN`, `CLINIC_ADMIN`, `SUPER_ADMIN`.

- **Authenticated** means any signed-in user. Handlers still scope data to the caller's clinic (and to the caller's own records for `PATIENT` users).
- **Public** means the route has no session guard. It is either intentionally public or authenticated by other means, such as a signature, token, or API key.
