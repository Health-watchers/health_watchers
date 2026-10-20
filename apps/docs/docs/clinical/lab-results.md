---
title: Lab Results
description: "Lab test ordering, result entry, critical-value detection with real-time alerts, acknowledgement of critical results, and clinician review."
---

# Lab Results

Lab test ordering, result entry, critical-value detection with real-time alerts, acknowledgement of critical results, and clinician review.

| | |
|---|---|
| **Base path** | `/api/v1/lab-results` |
| **Source** | [`apps/api/src/modules/lab-results/lab-results.controller.ts`](https://github.com/Health-watchers/health_watchers/blob/main/apps/api/src/modules/lab-results/lab-results.controller.ts) |

## Data model

`LabResult` (`lab-result.model.ts`):

| Field | Type | Notes |
|-------|------|-------|
| `patientId`, `encounterId`, `clinicId` | ObjectId | `encounterId` is optional |
| `orderedBy` | ObjectId → `User` | Ordering clinician |
| `testName`, `testCode` | string | e.g. `Complete Blood Count` / `CBC` |
| `status` | enum | `ordered`, `pending`, `resulted`, `cancelled` |
| `orderedAt`, `resultedAt` | Date | |
| `results[]` | sub-document | `parameter`, `value`, `unit`, `referenceRange`, `flag` (`H`, `L`, `HH`, `LL`, `N`) |
| `isCritical`, `criticalReason` | boolean / string | Set by `critical-value.service.ts` when results are entered |
| `criticalAcknowledgedBy`, `criticalAcknowledgedAt` | | Critical-value acknowledgement |
| `reviewedBy`, `reviewedAt`, `reviewComment` | | Clinician review |
| `notes`, `attachmentUrl` | string | |

## Workflow

1. `POST /lab-results` creates an order with status `ordered`.
2. `PUT /lab-results/:id/results` (DOCTOR or NURSE) enters results. Critical values notify the ordering clinician over Socket.IO, in-app notifications and email, and are listed under `GET /lab-results/critical`.
3. A clinician acknowledges the critical value (`/acknowledge`) and reviews the result (`/review`). Every action is written to the audit log.

## Key endpoints

| Method | Path | Roles |
|--------|------|-------|
| `POST` | `/api/v1/lab-results` | `DOCTOR`, `NURSE`, `CLINIC_ADMIN`, `SUPER_ADMIN` |
| `GET` | `/api/v1/lab-results` | Authenticated |
| `GET` | `/api/v1/lab-results/critical` | Authenticated |
| `GET` | `/api/v1/lab-results/:id` | Authenticated |
| `PUT` | `/api/v1/lab-results/:id/results` | `DOCTOR`, `NURSE` |
| `POST` | `/api/v1/lab-results/:id/acknowledge` | `DOCTOR`, `NURSE`, `CLINIC_ADMIN`, `SUPER_ADMIN` |
| `POST` | `/api/v1/lab-results/:id/review` | `DOCTOR`, `NURSE`, `CLINIC_ADMIN`, `SUPER_ADMIN` |

## Roles

Roles referenced by this module: `CLINIC_ADMIN`, `DOCTOR`, `NURSE`, `SUPER_ADMIN`.

- **Authenticated** means any signed-in user. Handlers still scope data to the caller's clinic (and to the caller's own records for `PATIENT` users).
- **Public** means the route has no session guard. It is either intentionally public or authenticated by other means, such as a signature, token, or API key.

## Related

- [Encounters](/clinical/encounters)
- [Notifications](/platform/notifications)
