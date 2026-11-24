# Mobile App Screen Design Spec

> **GitHub Issue:** [#1401](https://github.com/Health-watchers/health_watchers/issues/1401)  
> **Labels:** design, mobile, figma  
> **Difficulty:** Easy

---

## Overview

`apps/mobile/README.md` advertises login with biometrics and appointment management, but `apps/mobile/src/screens/` currently only contains Dashboard, Care Plans, Documents, Immunizations, and Payment screens. This document specifies the design requirements for the missing screens.

### Screens in Scope

1. Login (email/password + biometric prompt)
2. MFA / OTP Entry
3. Appointments List & Detail
4. Profile & Settings

---

## Design Tokens

All screens must consume the shared design tokens defined in `packages/design-tokens` (see `docs/design/DESIGN_TOKEN_PIPELINE.md`):

- **Colours** — `color.brand.*`, `color.neutral.*`, `color.semantic.*`
- **Typography** — `font.size.*`, `font.weight.*`, `font.family.*`
- **Spacing** — `spacing.*` (4 px base grid)
- **Radius** — `radius.*`
- **Shadow** — `shadow.*`
- **Motion** — `motion.duration.*`, `motion.easing.*`

Platform-specific overrides (e.g. iOS SF Pro vs Android Roboto) are resolved at the React Native theme layer; token names stay the same across platforms.

---

## Screen 1 — Login

### Purpose

Allow a returning user to authenticate with email/password or a platform biometric (Face ID on iOS, fingerprint on Android).

### Layout

```
┌─────────────────────────────┐
│        [App Logo]           │
│                             │
│  Email ___________________  │
│  Password ________________  │
│                             │
│       [Sign In]             │
│                             │
│  ────────  or  ────────    │
│                             │
│  [Use Face ID / Fingerprint]│
│                             │
│  Forgot password?           │
│  Don't have an account? Register │
└─────────────────────────────┘
```

### Component Details

| Element | Spec |
|---|---|
| App logo | Centred, top ~20% of screen, scales with Dynamic Type / font scale |
| Email field | `keyboardType="email-address"`, `autoCapitalize="none"`, `autoComplete="email"` |
| Password field | `secureTextEntry`, show/hide toggle (eye icon), min tap target 44 × 44 dp |
| Sign In button | Full-width, primary brand colour, min height 48 dp |
| Biometric button | Secondary outlined style; shows platform icon (Face ID or fingerprint); hidden if biometrics unavailable or not enrolled |
| Forgot password | Inline text link, min tap target 44 × 44 dp |
| Register link | Inline at bottom of form |

### States

- **Default** — empty form, biometric button visible if applicable
- **Loading** — Sign In button shows activity indicator, inputs disabled
- **Error: invalid credentials** — inline error below password field, inputs retain values
- **Error: account locked** — dismissible banner at top of form
- **Biometric prompt** — native OS modal overlays the screen (no custom UI required)

### iOS vs Android Variants

| | iOS | Android |
|---|---|---|
| Biometric icon | Face ID SVG | Fingerprint SVG |
| Label | "Use Face ID" | "Use fingerprint" |
| Prompt style | Apple HIG action sheet | Android BiometricPrompt dialog |

---

## Screen 2 — MFA / OTP Entry

### Purpose

Accept a 6-digit one-time password after password authentication, or when step-up authentication is required. Reuses the OTP input pattern from the web app (`components/OtpInput`).

### Layout

```
┌─────────────────────────────┐
│  ← Back                     │
│                             │
│  Verify your identity       │
│  We sent a code to          │
│  j•••••@example.com         │
│                             │
│  [_] [_] [_] [_] [_] [_]  │
│                             │
│  Resend code (00:45)        │
│                             │
│        [Verify]             │
└─────────────────────────────┘
```

### Component Details

| Element | Spec |
|---|---|
| 6 individual digit boxes | Auto-advance focus on digit entry; backspace on empty box moves focus left |
| Masked destination | Shows partially masked email or phone number |
| Countdown timer | 60 s countdown; "Resend code" link activates after expiry |
| Verify button | Disabled until all 6 boxes are filled; shows loading state on tap |

### States

- **Default** — waiting for input
- **Loading** — verifying code, inputs and button disabled
- **Error: wrong code** — inputs shake (spring animation), error message shown, boxes cleared, focus returns to first box
- **Error: expired** — error message, Resend link immediately enabled
- **Success** — navigates to post-login destination with a brief success flash

---

## Screen 3 — Appointments

### 3a. Appointments List

```
┌─────────────────────────────┐
│  Appointments          [+]  │
│                             │
│  UPCOMING                   │
│  ┌──────────────────────┐   │
│  │ Dr. A. Smith         │   │
│  │ General Checkup      │   │
│  │ Mon 29 Sep · 10:00   │   │
│  │ [Video] [Reschedule] │   │
│  └──────────────────────┘   │
│  ┌──────────────────────┐   │
│  │ Dr. B. Lee           │   │
│  │ Follow-up            │   │
│  │ Fri 3 Oct · 14:30    │   │
│  └──────────────────────┘   │
│                             │
│  PAST                       │
│  ┌──────────────────────┐   │
│  │ Dr. A. Smith         │   │
│  │ Annual Physical      │   │
│  │ Mon 1 Sep · 09:00    │   │
│  └──────────────────────┘   │
└─────────────────────────────┘
```

#### List Item Details

| Element | Spec |
|---|---|
| Provider name + specialty | Bold name, secondary text for specialty |
| Appointment type | Visit reason or appointment type label |
| Date & time | Human-readable format (e.g. "Mon 29 Sep · 10:00") |
| Telemedicine badge | "Video" chip shown when `type === "telemedicine"` |
| Reschedule / Cancel | Quick-action buttons on upcoming items only |

### 3b. Appointment Detail

```
┌─────────────────────────────┐
│  ← Appointments             │
│                             │
│  General Checkup            │
│  Dr. A. Smith               │
│  Monday, 29 Sep 2026        │
│  10:00 – 10:30 AM           │
│  City Health Clinic, Rm 4   │
│                             │
│  [Join Telemedicine]        │
│                             │
│  [Add to Calendar]          │
│  [Reschedule]               │
│  [Cancel Appointment]       │
│                             │
│  Preparation notes:         │
│  Please fast 12 hours…      │
└─────────────────────────────┘
```

#### Detail Actions

| Action | Behaviour |
|---|---|
| Join Telemedicine | Only shown for telemedicine appointments within 15 min of start time; deep-links to video call |
| Add to Calendar | Triggers native calendar sheet (iOS EventKit / Android Calendar Intent) with pre-filled event data |
| Reschedule | Navigates to reschedule flow (date/time picker) |
| Cancel Appointment | Shows confirmation bottom sheet before cancelling; past appointments hide this action |

#### States

- Upcoming (all actions visible)
- Upcoming — telemedicine ready (Join button active)
- Past (read-only; no reschedule/cancel)
- Cancelled (cancelled chip, read-only)

---

## Screen 4 — Profile & Settings

```
┌─────────────────────────────┐
│  Profile                    │
│  [Avatar] Jane Doe          │
│           jane@email.com    │
│                             │
│  PREFERENCES                │
│  Notifications          >   │
│  Language               >   │
│                             │
│  SECURITY                   │
│  Biometric unlock      [ON] │
│  Change password        >   │
│                             │
│  ACCOUNT                    │
│  Privacy & Data         >   │
│  Logout                     │
└─────────────────────────────┘
```

### Section: Preferences

| Setting | Component | Notes |
|---|---|---|
| Notifications | Row → navigates to notification preferences sub-screen | Mirrors `portal.settings.notifications` |
| Language | Row → language picker sheet | Lists supported locales; triggers i18n reload on change |

### Section: Security

| Setting | Component | Notes |
|---|---|---|
| Biometric unlock | Toggle switch | Disabled and greyed out if device does not support biometrics; toggling ON triggers OS enrolment prompt |
| Change password | Row → navigates to change-password form | |

### Section: Account

| Setting | Component | Notes |
|---|---|---|
| Privacy & Data | Row → navigates to consent/data export screen | |
| Logout | Destructive text button (red) | Shows confirmation bottom sheet |

### Profile Avatar

- Tapping the avatar opens an action sheet: "Take photo", "Choose from library", "Remove photo".
- Avatar upload is cropped to a circle, max 2 MB.

---

## Accessibility Requirements

- All interactive elements meet the 44 × 44 dp minimum touch target size.
- Colour is never the sole indicator of state; every semantic colour has an accompanying label or icon.
- All input fields have visible labels (not just placeholder text).
- Error messages are associated with their input via `accessibilityDescribedBy` (or equivalent).
- The OTP boxes announce digit count and current position (e.g. "Digit 3 of 6").
- Appointment action buttons have descriptive `accessibilityLabel` attributes (e.g. "Cancel appointment with Dr. Smith on 29 Sep").
- Toggle switches announce both label and current state.

---

## Figma Deliverables

All frames should be exported to **UI Designs / Mobile /** in the shared Figma file.

- [ ] `Login` — default, loading, error, biometric states (iOS + Android variants)
- [ ] `MFA OTP` — default, loading, error, expired states
- [ ] `Appointments List` — upcoming, past, empty state
- [ ] `Appointment Detail` — upcoming, telemedicine-ready, past, cancelled states
- [ ] `Profile & Settings` — default
- [ ] Notification Preferences sub-screen
- [ ] Language Picker sheet
- [ ] Logout confirmation bottom sheet
- [ ] Cancel Appointment confirmation bottom sheet

---

## Related

- `apps/mobile/src/screens/` — existing screen implementations
- `apps/mobile/README.md` — mobile app overview
- `docs/design/DESIGN_TOKEN_PIPELINE.md` — shared design token system
- Issue [#1402](https://github.com/Health-watchers/health_watchers/issues/1402) — Design token export pipeline
