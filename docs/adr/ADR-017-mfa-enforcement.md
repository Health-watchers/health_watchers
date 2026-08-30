# ADR-017: MFA Enforcement Strategy

## Status

Accepted

## Date

2024-06-10

## Context

HIPAA § 164.312(d) requires covered entities to implement procedures to verify that a person or entity seeking access to ePHI is the one claimed. For roles with broad access to patient records (doctors, nurses), a password alone is insufficient — credential theft or phishing would grant full PHI access.

At the same time, mandatory MFA must be rolled out without disrupting active clinical staff. A hard cutover would block doctors from accessing patient records mid-shift if they have not enrolled yet.

## Decision

### MFA is mandatory for DOCTOR and NURSE roles

TOTP (Time-based One-Time Password, RFC 6238) via `otplib` is the MFA method. These roles must enrol before they can access any PHI endpoint beyond their own profile.

### Grace period enforcement

Rather than blocking access immediately, a **grace period** is used:

1. When a DOCTOR or NURSE account is created, `mfaGracePeriodEndsAt` is set to `now + GRACE_PERIOD_DAYS` (default: 7 days, configurable).
2. During the grace period, the user can log in without MFA but receives a warning in every response.
3. After the grace period expires, `mfa-grace-period-job` (a background job running every hour) sets `isActive: false` on all DOCTOR/NURSE accounts that have not enabled MFA.
4. A deactivated account cannot log in; the CLINIC_ADMIN is notified to prompt enrolment.

This approach allows a smooth rollout without a hard cutover disrupting clinic operations.

### MFA login flow

```
Step 1: POST /auth/login
  → verify password
  → if mfaEnabled: return { requiresMfa: true, tempToken }
  → if not mfaEnabled AND grace period active: return tokens + { mfaWarning: true }
  → if not mfaEnabled AND grace period expired: return 403 MFA_REQUIRED

Step 2: POST /auth/mfa-verify
  → validate tempToken (5-min expiry, separate secret)
  → verify TOTP code against mfaSecret (otplib.authenticator.check)
  → check failedMfaAttempts < MAX_ATTEMPTS (account lockout applies)
  → return access + refresh tokens
```

### Backup codes

On MFA enrolment, 10 single-use backup codes are generated, hashed (bcrypt), and stored on the user document (`select: false`). These allow recovery if the TOTP device is lost. Each code is invalidated after use.

### Patient portal MFA (optional)

Patients have a separate optional MFA flow (`portalMfaEnabled`, `portalMfaSecret`). It uses the same TOTP mechanism but is not mandatory — patients opt in for additional security.

### MFA secret storage

- `mfaSecret` and `portalMfaSecret` are stored with `select: false` — never returned in API responses.
- Backup codes are bcrypt-hashed before storage — plaintext codes are shown to the user only once at enrolment.

### Metrics

`failedMfaAttempts` is tracked per user. After exceeding the threshold, `lockedUntil` is set (same lockout mechanism as password failures). This prevents TOTP brute-force attacks.

## Consequences

### Positive

- Grace period prevents clinical disruption during rollout; staff have a defined window to enrol.
- TOTP is a well-understood, widely supported standard (Google Authenticator, Authy, 1Password all work).
- Background job enforcement means the platform self-heals — staff who ignore MFA prompts are automatically deactivated after the grace period.
- Separate temp token for MFA step prevents session fixation between password verification and TOTP verification.

### Negative / Trade-offs

- TOTP is vulnerable to real-time phishing (attacker proxies the TOTP code); hardware security keys (FIDO2/WebAuthn) would provide phishing resistance but add UX complexity.
- If a doctor loses their TOTP device and backup codes, CLINIC_ADMIN must manually re-enrol them, creating a support burden.
- The grace period creates a window where DOCTOR/NURSE accounts have full PHI access without MFA — this is a deliberate trade-off against clinical continuity.

### Neutral

- `mfaGracePeriodEndsAt` is indexed in the `users` collection so the background job can efficiently query accounts approaching expiry without a full collection scan.

## Alternatives Considered

| Option | Why Rejected |
|--------|-------------|
| FIDO2 / WebAuthn | Stronger phishing resistance but requires hardware keys or platform authenticators; UX barrier too high for current rollout |
| SMS OTP | SMS is susceptible to SIM-swap attacks; TOTP is more secure and works offline |
| Email OTP | Same weaknesses as SMS; also creates a dependency on SMTP availability for every login |
| Hard cutover (block immediately if no MFA) | Too disruptive for clinical staff in the middle of patient care |

## References

- `apps/api/src/modules/auth/token.service.ts` — temp token signing
- `apps/api/src/modules/auth/mfa-grace-period-job.ts` — background enforcement
- `apps/api/src/config/env.ts` — `SECURITY_TRAINING_EXPIRY_DAYS`
- `docs/DATABASE_SCHEMA.md` — `users` collection MFA fields
- `.changeset/feat-mfa-enforcement-doctor-nurse.md`
- `docs/adr/ADR-007-authentication-approach.md`
