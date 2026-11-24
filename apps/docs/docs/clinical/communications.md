---
title: Patient Communications
description: "Outbound SMS and WhatsApp messages to patients, with a per-patient communication log."
---

# Patient Communications

Outbound SMS and WhatsApp messages to patients, with a per-patient communication log.

| | |
|---|---|
| **Base path** | `/api/v1/patients/:id/communications` |
| **Source** | [`apps/api/src/modules/communications/communications.controller.ts`](https://github.com/Health-watchers/health_watchers/blob/main/apps/api/src/modules/communications/communications.controller.ts) |

## Data model

- CommunicationLog (`communication-log.model.ts`)

## Key endpoints

| Method | Path | Roles |
|--------|------|-------|
| `POST` | `/api/v1/patients/:id/communications` | `DOCTOR`, `NURSE`, `CLINIC_ADMIN` |
| `GET` | `/api/v1/patients/:id/communications` | `DOCTOR`, `NURSE`, `CLINIC_ADMIN` |
| `POST` | `/api/v1/patients/:id/communications/send-sms` | `DOCTOR`, `NURSE`, `CLINIC_ADMIN` |
| `POST` | `/api/v1/patients/:id/communications/send-whatsapp` | `DOCTOR`, `NURSE`, `CLINIC_ADMIN` |

## Roles

Roles referenced by this module: `CLINIC_ADMIN`, `DOCTOR`, `NURSE`.

- **Authenticated** means any signed-in user. Handlers still scope data to the caller's clinic (and to the caller's own records for `PATIENT` users).
- **Public** means the route has no session guard. It is either intentionally public or authenticated by other means, such as a signature, token, or API key.
