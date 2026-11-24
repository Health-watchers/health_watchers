---
title: AI Features
description: "Gemini-backed clinical assistance: encounter and patient summaries, insights, health-trend analysis, lab interpretation, care-plan generation, differential diagnosis, dosage calculation, triage queue, transcription, and population-health analytics."
---

# AI Features

Gemini-backed clinical assistance: encounter and patient summaries, insights, health-trend analysis, lab interpretation, care-plan generation, differential diagnosis, dosage calculation, triage queue, transcription, and population-health analytics.

| | |
|---|---|
| **Base path** | `/api/v1/ai` |
| **Source** | [`apps/api/src/modules/ai/population-health.controller.ts`](https://github.com/Health-watchers/health_watchers/blob/main/apps/api/src/modules/ai/population-health.controller.ts)<br/>[`apps/api/src/modules/ai/ai.routes.ts`](https://github.com/Health-watchers/health_watchers/blob/main/apps/api/src/modules/ai/ai.routes.ts) |

## Data model

- TriageQueue (`triage.model.ts`): triage requests and status
- PopulationHealth (`population-health.model.ts`): population-health snapshots

## Key endpoints

| Method | Path | Roles |
|--------|------|-------|
| `GET` | `/api/v1/ai/population-health` | `CLINIC_ADMIN`, `DOCTOR` |
| `POST` | `/api/v1/ai/population-insights` | `CLINIC_ADMIN` |
| `GET` | `/api/v1/ai/population-health/history` | `CLINIC_ADMIN`, `DOCTOR` |
| `GET` | `/api/v1/ai/health` | Public |
| `POST` | `/api/v1/ai/summarize` | Authenticated |
| `POST` | `/api/v1/ai/patient-summary/:patientId` | `DOCTOR`, `CLINIC_ADMIN`, `SUPER_ADMIN`, `NURSE` |
| `POST` | `/api/v1/ai/insights` | Authenticated |
| `POST` | `/api/v1/ai/drug-interactions` | `DOCTOR`, `CLINIC_ADMIN`, `SUPER_ADMIN`, `NURSE` |
| `POST` | `/api/v1/ai/health-trends` | Authenticated |
| `POST` | `/api/v1/ai/interpret-labs` | Authenticated |
| `POST` | `/api/v1/ai/generate-care-plan` | `DOCTOR`, `CLINIC_ADMIN`, `SUPER_ADMIN` |
| `POST` | `/api/v1/ai/differential-diagnosis` | Authenticated |
| `POST` | `/api/v1/ai/dosage-calculator` | `DOCTOR`, `CLINIC_ADMIN`, `SUPER_ADMIN` |
| `POST` | `/api/v1/ai/triage` | Authenticated |
| `GET` | `/api/v1/ai/triage/queue` | `CLINIC_ADMIN`, `NURSE` |
| `PUT` | `/api/v1/ai/triage/:id/status` | `CLINIC_ADMIN`, `NURSE` |
| `POST` | `/api/v1/ai/transcribe` | `DOCTOR`, `NURSE` |
| `GET` | `/api/v1/ai/settings` | Authenticated |
| `POST` | `/api/v1/ai/transcribe-audio` | `DOCTOR`, `NURSE`, `CLINIC_ADMIN` |

## Roles

Roles referenced by this module: `CLINIC_ADMIN`, `DOCTOR`, `NURSE`, `SUPER_ADMIN`.

- **Authenticated** means any signed-in user. Handlers still scope data to the caller's clinic (and to the caller's own records for `PATIENT` users).
- **Public** means the route has no session guard. It is either intentionally public or authenticated by other means, such as a signature, token, or API key.

:::note

AI routes use a dedicated rate limiter (`aiLimiter`) and a request body limit configurable through `AI_REQUEST_BODY_SIZE` (default `50kb`).

:::
