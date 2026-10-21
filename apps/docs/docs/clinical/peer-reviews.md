---
title: Peer Reviews
description: "Clinical peer review: clinic admins assign encounters to reviewers, doctors submit reviews, and admins see aggregate statistics."
---

# Peer Reviews

Clinical peer review: clinic admins assign encounters to reviewers, doctors submit reviews, and admins see aggregate statistics.

| | |
|---|---|
| **Base path** | `/api/v1/peer-reviews` |
| **Source** | [`apps/api/src/modules/peer-reviews/peer-reviews.router.ts`](https://github.com/Health-watchers/health_watchers/blob/main/apps/api/src/modules/peer-reviews/peer-reviews.router.ts) |

## Data model

- PeerReview (`peer-review.model.ts`)

## Key endpoints

| Method | Path | Roles |
|--------|------|-------|
| `POST` | `/api/v1/peer-reviews` | `CLINIC_ADMIN` |
| `GET` | `/api/v1/peer-reviews/assigned` | `DOCTOR`, `CLINIC_ADMIN` |
| `GET` | `/api/v1/peer-reviews/received` | `DOCTOR`, `CLINIC_ADMIN` |
| `PUT` | `/api/v1/peer-reviews/:id` | `DOCTOR`, `CLINIC_ADMIN` |
| `GET` | `/api/v1/peer-reviews/stats` | `CLINIC_ADMIN` |

## Roles

Roles referenced by this module: `CLINIC_ADMIN`, `DOCTOR`.

- **Authenticated** means any signed-in user. Handlers still scope data to the caller's clinic (and to the caller's own records for `PATIENT` users).
- **Public** means the route has no session guard. It is either intentionally public or authenticated by other means, such as a signature, token, or API key.
