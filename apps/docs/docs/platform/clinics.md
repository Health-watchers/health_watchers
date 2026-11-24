---
title: Clinics, Settings & Onboarding
description: "The tenant itself."
---

# Clinics, Settings & Onboarding

The tenant itself. It covers clinic CRUD (Super Admin), clinic users, Stellar keypair rotation, clinic settings (logo, signature, Stellar configuration), and the five-step onboarding wizard (`/onboarding`).

| | |
|---|---|
| **Base path** | `/api/v1/clinics, /api/v1/settings, /api/v1/onboarding` |
| **Source** | [`apps/api/src/modules/clinics/clinics.controller.ts`](https://github.com/Health-watchers/health_watchers/blob/main/apps/api/src/modules/clinics/clinics.controller.ts)<br/>[`apps/api/src/modules/clinics/clinic-settings.controller.ts`](https://github.com/Health-watchers/health_watchers/blob/main/apps/api/src/modules/clinics/clinic-settings.controller.ts)<br/>[`apps/api/src/modules/clinics/onboarding.routes.ts`](https://github.com/Health-watchers/health_watchers/blob/main/apps/api/src/modules/clinics/onboarding.routes.ts) |

## Data model

- Clinic (`clinic.model.ts`): `name`, `address`, `phone`, `email`, `stellarPublicKey`, `federationAddress`, `subscriptionTier`, `isActive`, `onboardingStep` (1–5), `onboardingCompleted`, `paymentSplitConfig`
- ClinicSettings (`clinic-settings.model.ts`): timezone, working hours, default appointment duration, branding
- ClinicKeypair (`clinic-keypair.model.ts`): encrypted Stellar keypair history

## Key endpoints

| Method | Path | Roles |
|--------|------|-------|
| `POST` | `/api/v1/clinics` | `SUPER_ADMIN` |
| `GET` | `/api/v1/clinics` | `SUPER_ADMIN` |
| `GET` | `/api/v1/clinics/:id` | Authenticated |
| `PUT` | `/api/v1/clinics/:id` | Authenticated |
| `DELETE` | `/api/v1/clinics/:id` | `SUPER_ADMIN` |
| `GET` | `/api/v1/clinics/:id/users` | Authenticated |
| `POST` | `/api/v1/clinics/:id/rotate-keypair` | `SUPER_ADMIN` |
| `POST` | `/api/v1/clinics/:id/keypair/rotate` | `SUPER_ADMIN` |
| `POST` | `/api/v1/settings/logo` | `CLINIC_ADMIN`, `SUPER_ADMIN` |
| `POST` | `/api/v1/settings/signature` | `CLINIC_ADMIN`, `SUPER_ADMIN` |
| `GET` | `/api/v1/settings` | `CLINIC_ADMIN`, `SUPER_ADMIN` |
| `PUT` | `/api/v1/settings` | `CLINIC_ADMIN`, `SUPER_ADMIN` |
| `PUT` | `/api/v1/settings/stellar` | `CLINIC_ADMIN`, `SUPER_ADMIN` |
| `GET` | `/api/v1/onboarding/status` | Authenticated |
| `PUT` | `/api/v1/onboarding/step/:step` | Authenticated |
| `POST` | `/api/v1/onboarding/complete` | Authenticated |

## Roles

Roles referenced by this module: `CLINIC_ADMIN`, `SUPER_ADMIN`.

- **Authenticated** means any signed-in user. Handlers still scope data to the caller's clinic (and to the caller's own records for `PATIENT` users).
- **Public** means the route has no session guard. It is either intentionally public or authenticated by other means, such as a signature, token, or API key.

## Related

- [Onboarding a clinic (user guide)](/user-guide/onboarding-a-clinic)
