# Implementation Plan: Settings & Profile

## Overview

Implement the `/settings` page in `apps/web` with Profile, Security, and Preferences sections, plus the supporting Next.js API route proxies and backend endpoints in `apps/api`.

## Tasks

- [x] 1. Add backend API endpoints in `apps/api`

  - [x] 1.1 Create `users` module with `GET /api/v1/users/me` endpoint

    - Add route handler that returns the authenticated user's `fullName`, `email`, `role`, `clinic`, `mfaEnabled`, and `preferences`
    - Read the authenticated user from the JWT middleware (reuse existing auth middleware)
    - _Requirements: 2.1, 2.2, 4.1, 5.1_

  - [x] 1.2 Add `PATCH /api/v1/users/me/profile` endpoint

    - Accept `{ fullName }` body, validate and persist to the User document
    - Return the updated user
    - _Requirements: 2.5, 2.6_

  - [x] 1.3 Add `POST /api/v1/users/me/password` endpoint

    - Accept `{ currentPassword, newPassword }`, verify current password, hash and save new password
    - Return 400 with descriptive error if current password is wrong
    - _Requirements: 3.6, 3.7_

  - [x] 1.4 Add MFA endpoints: `POST /api/v1/users/me/mfa/enable`, `POST /api/v1/users/me/mfa/verify`, `POST /api/v1/users/me/mfa/disable`

    - `enable` generates a TOTP secret and returns `{ qrCodeUrl, secret }`
    - `verify` accepts `{ code }`, validates the TOTP code, and sets `mfaEnabled = true`
    - `disable` sets `mfaEnabled = false` and clears `mfaSecret`
    - _Requirements: 4.2, 4.3, 4.4, 4.5, 4.6, 4.7_

  - [x] 1.5 Add `PATCH /api/v1/users/me/preferences` endpoint
    - Accept `{ language?, emailNotifications?, inAppNotifications? }` and persist to the `preferences` sub-document
    - Add `preferences` sub-document to the User model if not present
    - _Requirements: 5.2, 5.4, 5.5_

- [x] 2. Create Next.js API route proxies in `apps/web`

  - [~] 2.1 Create `apps/web/src/app/api/settings/profile/route.ts`

    - `PATCH` handler: reads `accessToken` cookie, forwards to backend with `Authorization: Bearer` header
    - _Requirements: 2.5_

  - [~] 2.2 Create `apps/web/src/app/api/settings/password/route.ts`

    - `POST` handler: same proxy pattern
    - _Requirements: 3.6_

  - [x] 2.3 Create `apps/web/src/app/api/settings/mfa/enable/route.ts` and `apps/web/src/app/api/settings/mfa/disable/route.ts`

    - `POST` handlers for MFA enable (returns `{ qrCodeUrl, secret }`) and disable
    - _Requirements: 4.2, 4.7_

  - [~] 2.4 Create `apps/web/src/app/api/settings/preferences/route.ts`
    - `PATCH` handler: same proxy pattern
    - _Requirements: 5.2, 5.4_

- [x] 3. Checkpoint — Ensure all API routes respond correctly before building UI

  - Ensure all tests pass, ask the user if questions arise.

- [ ] 4. Build shared settings UI components

  - [~] 4.1 Create `apps/web/src/components/settings/SubNavigation.tsx`

    - Render three `<button>` items (Profile, Security, Preferences)
    - Active item gets `aria-current="page"` and a left-border accent style
    - _Requirements: 1.2, 1.3_

  - [~] 4.2 Create `apps/web/src/components/settings/PasswordStrengthBar.tsx`

    - Accept `password: string` prop, derive `StrengthLevel` using the scoring rules from the design (weak / fair / strong / very-strong)
    - Render four colored segments
    - _Requirements: 3.2, 3.3_

  - [ ]\* 4.3 Write unit tests for `PasswordStrengthBar` scoring function
    - Test each boundary: length < 8, length ≥ 8 with one class, two/three classes, length ≥ 12 all four classes
    - _Requirements: 3.3_

- [x] 5. Implement ProfileSection

  - [~] 5.1 Create `apps/web/src/components/settings/ProfileSection.tsx`

    - Use `react-hook-form` + Zod `profileSchema` (`fullName` min 1, max 100)
    - Pre-populate `fullName` from `UserProfile` prop; show read-only fields for email, role, clinic
    - Enable Save button only when `formState.isDirty`; hide/disable it otherwise
    - On success call `queryClient.invalidateQueries(['me'])`; on failure display error without clearing fields
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6_

  - [ ]\* 5.2 Write unit tests for ProfileSection
    - Test Save button disabled when name unchanged, enabled when dirty
    - Test error message displayed on API failure
    - _Requirements: 2.3, 2.4, 2.6_

- [ ] 6. Implement SecuritySection — ChangePasswordForm

  - [~] 6.1 Create `apps/web/src/components/settings/ChangePasswordForm.tsx`

    - Three fields: Current Password, New Password, Confirm New Password
    - Embed `PasswordStrengthBar` below the New Password field, updating in real time
    - Use `changePasswordSchema` with `.refine` to validate matching passwords client-side
    - Display inline error on mismatch without submitting; show success/error feedback after API call
    - _Requirements: 3.1, 3.2, 3.4, 3.5, 3.6, 3.7_

  - [ ]\* 6.2 Write unit tests for ChangePasswordForm validation
    - Test that mismatched passwords show inline error and do not submit
    - Test that matching passwords trigger the API call
    - _Requirements: 3.4, 3.5_

- [x] 7. Implement SecuritySection — MFA

  - [~] 7.1 Create `apps/web/src/components/settings/MfaSetupModal.tsx`

    - Wrap existing `Modal` component; display QR code image and 6-digit `<Input>` (pattern `[0-9]{6}`)
    - Use `mfaVerifySchema`; on valid submit call verify endpoint, close modal on success, show inline error on failure
    - _Requirements: 4.3, 4.4, 4.5, 4.6_

  - [~] 7.2 Create `apps/web/src/components/settings/MfaToggle.tsx`

    - Display current MFA status; "Enable" button opens `MfaSetupModal`
    - "Disable" button shows an inline confirmation before calling the disable endpoint
    - Call `onMfaStatusChange` callback on success
    - _Requirements: 4.1, 4.2, 4.7_

  - [ ]\* 7.3 Write unit tests for MfaToggle
    - Test that clicking Enable opens the modal
    - Test that clicking Disable shows confirmation before calling the API
    - _Requirements: 4.2, 4.7_

- [ ] 8. Implement PreferencesSection

  - [~] 8.1 Create `apps/web/src/components/settings/PreferencesSection.tsx`

    - Language selector pre-populated from `preferences.language`; on change write locale cookie and call `router.refresh()`
    - Email and In-App notification toggles as `<input type="checkbox" role="switch">`
    - Each toggle fires a PATCH request on change; on failure revert to previous value and display error
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_

  - [ ]\* 8.2 Write unit tests for PreferencesSection
    - Test toggle revert on API failure
    - Test language change triggers locale cookie update
    - _Requirements: 5.2, 5.5_

- [ ] 9. Assemble SettingsClient and page route

  - [~] 9.1 Create `apps/web/src/components/settings/SecuritySection.tsx`

    - Compose `ChangePasswordForm` and `MfaToggle` into a single section panel
    - _Requirements: 3.1, 4.1_

  - [~] 9.2 Create `apps/web/src/app/settings/SettingsClient.tsx`

    - `'use client'` component; manage `active` section state (default `'profile'`)
    - Fetch current user via `GET /api/v1/users/me` with TanStack Query key `['me']`
    - Render `SubNavigation` + active section panel; pass user data as props
    - _Requirements: 1.1, 1.3, 1.4_

  - [~] 9.3 Create `apps/web/src/app/settings/page.tsx`
    - RSC shell that renders `SettingsClient` within the dashboard layout
    - _Requirements: 1.1_

- [~] 10. Final checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP
- Each task references specific requirements for traceability
- Property tests are omitted from the design's Correctness Properties section (none were defined); unit tests cover the key behavioral contracts
