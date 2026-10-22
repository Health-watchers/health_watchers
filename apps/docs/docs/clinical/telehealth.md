---
title: Telehealth
description: "Video visit sessions with start/join/end, captions, bandwidth adaptation, consented recording, transcripts, in-session chat, and archiving."
---

# Telehealth

Video visit sessions with start/join/end, captions, bandwidth adaptation, consented recording, transcripts, in-session chat, and archiving.

| | |
|---|---|
| **Base path** | `/api/v1/telehealth` |
| **Source** | [`apps/api/src/modules/telehealth/telehealth.controller.ts`](https://github.com/Health-watchers/health_watchers/blob/main/apps/api/src/modules/telehealth/telehealth.controller.ts) |

## Data model

- TelehealthSession, TelehealthRecording, TelehealthTranscript, TelehealthChatMessage (`models/`)

## Key endpoints

| Method | Path | Roles |
|--------|------|-------|
| `POST` | `/api/v1/telehealth/sessions` | `SUPER_ADMIN`, `CLINIC_ADMIN`, `ADMIN`, `DOCTOR`, `NURSE` |
| `GET` | `/api/v1/telehealth/sessions` | `SUPER_ADMIN`, `CLINIC_ADMIN`, `ADMIN`, `DOCTOR`, `NURSE` |
| `GET` | `/api/v1/telehealth/sessions/:id` | `SUPER_ADMIN`, `CLINIC_ADMIN`, `ADMIN`, `DOCTOR`, `NURSE` |
| `POST` | `/api/v1/telehealth/sessions/:id/start` | `SUPER_ADMIN`, `CLINIC_ADMIN`, `ADMIN`, `DOCTOR`, `NURSE` |
| `POST` | `/api/v1/telehealth/sessions/:id/join` | `SUPER_ADMIN`, `CLINIC_ADMIN`, `ADMIN`, `DOCTOR`, `NURSE` |
| `POST` | `/api/v1/telehealth/sessions/:id/end` | `SUPER_ADMIN`, `CLINIC_ADMIN`, `ADMIN`, `DOCTOR`, `NURSE` |
| `POST` | `/api/v1/telehealth/sessions/:id/cancel` | `SUPER_ADMIN`, `CLINIC_ADMIN`, `ADMIN`, `DOCTOR`, `NURSE` |
| `PATCH` | `/api/v1/telehealth/sessions/:id/captions` | `SUPER_ADMIN`, `CLINIC_ADMIN`, `ADMIN`, `DOCTOR`, `NURSE` |
| `PATCH` | `/api/v1/telehealth/sessions/:id/bandwidth` | `SUPER_ADMIN`, `CLINIC_ADMIN`, `ADMIN`, `DOCTOR`, `NURSE` |
| `POST` | `/api/v1/telehealth/sessions/:id/recording/init` | `SUPER_ADMIN`, `CLINIC_ADMIN`, `ADMIN`, `DOCTOR`, `NURSE` |
| `POST` | `/api/v1/telehealth/sessions/:id/recording/consent` | `SUPER_ADMIN`, `CLINIC_ADMIN`, `ADMIN`, `DOCTOR`, `NURSE` |
| `POST` | `/api/v1/telehealth/sessions/:id/recording/start` | `SUPER_ADMIN`, `CLINIC_ADMIN`, `ADMIN`, `DOCTOR`, `NURSE` |
| `POST` | `/api/v1/telehealth/sessions/:id/recording/stop` | `SUPER_ADMIN`, `CLINIC_ADMIN`, `ADMIN`, `DOCTOR`, `NURSE` |
| `GET` | `/api/v1/telehealth/sessions/:id/recording` | `SUPER_ADMIN`, `CLINIC_ADMIN`, `ADMIN`, `DOCTOR`, `NURSE` |
| `POST` | `/api/v1/telehealth/sessions/:id/transcript` | `SUPER_ADMIN`, `CLINIC_ADMIN`, `ADMIN`, `DOCTOR`, `NURSE` |
| `GET` | `/api/v1/telehealth/sessions/:id/transcript` | `SUPER_ADMIN`, `CLINIC_ADMIN`, `ADMIN`, `DOCTOR`, `NURSE` |
| `GET` | `/api/v1/telehealth/sessions/:id/chat` | `SUPER_ADMIN`, `CLINIC_ADMIN`, `ADMIN`, `DOCTOR`, `NURSE` |
| `POST` | `/api/v1/telehealth/sessions/:id/chat` | `SUPER_ADMIN`, `CLINIC_ADMIN`, `ADMIN`, `DOCTOR`, `NURSE` |
| `POST` | `/api/v1/telehealth/sessions/:id/archive` | `SUPER_ADMIN`, `CLINIC_ADMIN`, `ADMIN`, `DOCTOR`, `NURSE` |
| `GET` | `/api/v1/telehealth/sessions/:id/archive` | `SUPER_ADMIN`, `CLINIC_ADMIN`, `ADMIN`, `DOCTOR`, `NURSE` |
| `GET` | `/api/v1/telehealth/archive` | `SUPER_ADMIN`, `CLINIC_ADMIN`, `ADMIN`, `DOCTOR`, `NURSE` |

## Roles

Roles referenced by this module: `ADMIN`, `CLINIC_ADMIN`, `DOCTOR`, `NURSE`, `SUPER_ADMIN`.

- **Authenticated** means any signed-in user. Handlers still scope data to the caller's clinic (and to the caller's own records for `PATIENT` users).
- **Public** means the route has no session guard. It is either intentionally public or authenticated by other means, such as a signature, token, or API key.

## Related

- [Appointments](/clinical/appointments)
