---
title: Care Team Inbox
description: "A threaded inbox for patient messages and internal staff conversations, with read state, assignment, and replies."
---

# Care Team Inbox

A threaded inbox for patient messages and internal staff conversations, with read state, assignment, and replies.

| | |
|---|---|
| **Base path** | `/api/v1/inbox` |
| **Source** | [`apps/api/src/modules/inbox/inbox.controller.ts`](https://github.com/Health-watchers/health_watchers/blob/main/apps/api/src/modules/inbox/inbox.controller.ts) |

## Data model

- InboxThread (`inbox-thread.model.ts`)

## Key endpoints

| Method | Path | Roles |
|--------|------|-------|
| `GET` | `/api/v1/inbox/threads` | `SUPER_ADMIN`, `CLINIC_ADMIN`, `DOCTOR`, `NURSE`, `ASSISTANT` |
| `GET` | `/api/v1/inbox/unread-count` | `SUPER_ADMIN`, `CLINIC_ADMIN`, `DOCTOR`, `NURSE`, `ASSISTANT` |
| `GET` | `/api/v1/inbox/staff` | `SUPER_ADMIN`, `CLINIC_ADMIN`, `DOCTOR`, `NURSE`, `ASSISTANT` |
| `GET` | `/api/v1/inbox/threads/:threadId` | `SUPER_ADMIN`, `CLINIC_ADMIN`, `DOCTOR`, `NURSE`, `ASSISTANT` |
| `PATCH` | `/api/v1/inbox/threads/:threadId` | `SUPER_ADMIN`, `CLINIC_ADMIN`, `DOCTOR`, `NURSE`, `ASSISTANT` |
| `POST` | `/api/v1/inbox/threads/:threadId/read` | `SUPER_ADMIN`, `CLINIC_ADMIN`, `DOCTOR`, `NURSE`, `ASSISTANT` |
| `POST` | `/api/v1/inbox/threads/:threadId/reply` | `SUPER_ADMIN`, `CLINIC_ADMIN`, `DOCTOR`, `NURSE`, `ASSISTANT` |

## Roles

Roles referenced by this module: `ASSISTANT`, `CLINIC_ADMIN`, `DOCTOR`, `NURSE`, `SUPER_ADMIN`.

- **Authenticated** means any signed-in user. Handlers still scope data to the caller's clinic (and to the caller's own records for `PATIENT` users).
- **Public** means the route has no session guard. It is either intentionally public or authenticated by other means, such as a signature, token, or API key.

## Related

- [Patient Portal](/clinical/portal)
