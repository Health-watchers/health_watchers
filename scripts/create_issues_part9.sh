#!/bin/bash
REPO="Health-watchers/health_watchers"

gh issue create --repo "$REPO" \
  --title "No \`README\` badges or project status indicators" \
  --label "documentation" \
  --body "**Branch:** \`fix/readme-badges-cleanup\`
**Timeframe:** 3 hours

## Description
The \`README.md\` has no CI status badge, no test coverage badge, no license badge, and no version badge. The README also still contains scaffold-era language ('10% implementation') that should be updated as features are completed.

## Tasks
- Add a CI status badge linking to the GitHub Actions workflow
- Add a test coverage badge (from Codecov or Coveralls)
- Add a license badge and a \`node\` version badge
- Remove all references to '10% implementation' and 'scaffold' from \`README.md\`
- Add a 'Getting Started' section with a 5-minute quickstart using Docker Compose

## Acceptance Criteria
- \`README.md\` displays a green CI badge when the main branch is passing
- No 'scaffold' or '10% implementation' language remains in \`README.md\`
- The Docker Compose quickstart works end-to-end in under 5 minutes"

gh issue create --repo "$REPO" \
  --title "No HIPAA audit logging for PHI access" \
  --label "security" \
  --body "**Branch:** \`feat/hipaa-audit-logging\`
**Timeframe:** 5 days

## Description
HIPAA's Security Rule (45 CFR § 164.312(b)) requires audit controls that record and examine activity in information systems that contain or use ePHI. There is no audit logging anywhere in the codebase. Every access to patient records, every login, every data export goes completely unlogged.

## Tasks
- Create \`AuditLogModel\` with fields: \`userId\`, \`clinicId\`, \`action\` (enum), \`resourceType\`, \`resourceId\`, \`ipAddress\`, \`userAgent\`, \`timestamp\`, \`outcome\`
- Create an \`auditLog(action, resource, req)\` utility function
- Log the following events: \`LOGIN_SUCCESS\`, \`LOGIN_FAILURE\`, \`PATIENT_VIEW\`, \`PATIENT_CREATE\`, \`PATIENT_UPDATE\`, \`PATIENT_DELETE\`, \`ENCOUNTER_VIEW\`, \`PAYMENT_CREATE\`, \`EXPORT_PATIENT_DATA\`
- Create \`GET /api/v1/audit-logs\` (SUPER_ADMIN only) with date range filtering and pagination
- Audit logs must be immutable — no update or delete endpoints

## Acceptance Criteria
- Every \`GET /patients/:id\` request creates an audit log entry with \`action: 'PATIENT_VIEW'\`
- Every failed login creates an audit log entry with \`action: 'LOGIN_FAILURE'\`
- \`GET /audit-logs\` returns paginated audit entries for SUPER_ADMIN only
- Audit log entries cannot be deleted or modified via any API endpoint
- Audit logs are stored in a separate MongoDB collection"

gh issue create --repo "$REPO" \
  --title "JWT tokens not validated for \`iss\` or \`aud\` claims" \
  --label "security" \
  --body "**Branch:** \`fix/jwt-iss-aud-claims\`
**Timeframe:** 3 hours

## Description
\`token.service.ts\` signs JWTs without \`issuer\` or \`audience\` claims. If another service in the same infrastructure uses JWTs signed with the same secret, tokens from that service could be accepted by this API. This is a token confusion attack vector.

## Tasks
- Add \`issuer: 'health-watchers-api'\` and \`audience: 'health-watchers-client'\` to \`jwt.sign()\` options
- Add \`issuer\` and \`audience\` verification to \`jwt.verify()\` calls
- Add \`JWT_ISSUER\` and \`JWT_AUDIENCE\` to \`.env.example\` and config
- Update all token verification calls to pass the \`issuer\` and \`audience\` options

## Acceptance Criteria
- A token signed without \`iss: 'health-watchers-api'\` is rejected by \`verifyAccessToken\`
- A token signed with the correct secret but wrong \`aud\` is rejected
- Unit tests cover the rejection of tokens with wrong \`iss\` and \`aud\`"

gh issue create --repo "$REPO" \
  --title "No account lockout after repeated failed login attempts" \
  --label "security" \
  --body "**Branch:** \`feat/account-lockout-brute-force\`
**Timeframe:** 2 days

## Description
The login endpoint has no account-level brute-force protection. Rate limiting protects per-IP, but an attacker using a botnet or rotating proxies can bypass IP-based limits. There is no mechanism to lock an account after N consecutive failed attempts.

## Tasks
- Add \`failedLoginAttempts: number\` (default: 0) and \`lockedUntil: Date\` (optional) fields to \`UserModel\`
- On each failed login: increment \`failedLoginAttempts\` and set \`lockedUntil = now + 15 minutes\` after 5 failures
- On login attempt: check \`lockedUntil > now\` and return \`423 Locked\` if locked
- On successful login: reset \`failedLoginAttempts\` to 0 and clear \`lockedUntil\`
- Add \`POST /auth/unlock\` (SUPER_ADMIN only) to manually unlock an account

## Acceptance Criteria
- After 5 failed logins, the 6th attempt returns \`423\` even with the correct password
- After 15 minutes, the account automatically unlocks
- A successful login resets the failed attempt counter"

gh issue create --repo "$REPO" \
  --title "\`node-fetch\` v3 is ESM-only but project uses CommonJS — import will fail at runtime" \
  --label "bug" \
  --body "**Branch:** \`fix/remove-node-fetch-use-native\`
**Timeframe:** 3 hours

## Description
\`apps/stellar-service/package.json\` depends on \`node-fetch@^3.3.2\`. \`node-fetch\` v3 is an ESM-only package. The stellar-service uses \`\"module\": \"commonjs\"\` in its TypeScript config. Attempting to \`require()\` an ESM-only package in a CommonJS context throws \`ERR_REQUIRE_ESM\` at runtime. The service will crash on startup.

## Tasks
- Remove \`node-fetch\` and \`@types/node-fetch\` from \`apps/stellar-service/package.json\`
- Replace all \`import fetch from 'node-fetch'\` with the native \`fetch\` available in Node 18+
- Add \`\"lib\": [\"ES2020\", \"DOM\"]\` to \`apps/stellar-service/tsconfig.json\`
- Verify the friendbot call in \`POST /fund\` works with native fetch

## Acceptance Criteria
- \`npm run dev\` in \`apps/stellar-service\` starts without \`ERR_REQUIRE_ESM\`
- \`POST /fund\` successfully calls the Stellar friendbot using native fetch
- No \`node-fetch\` import exists in the codebase"

gh issue create --repo "$REPO" \
  --title "Stellar \`networkPassphrase\` hardcoded as string literals" \
  --label "bug" \
  --body "**Branch:** \`fix/stellar-network-passphrase-const\`
**Timeframe:** 2 hours

## Description
\`stellar-service/src/index.ts\` hardcodes the mainnet passphrase \`\"Public Global Stellar Network ; September 2015\"\` and testnet passphrase as inline strings. A single typo in either string would cause all transaction signing to fail silently or produce invalid transactions.

## Tasks
- Import \`Networks\` from \`@stellar/stellar-sdk\`
- Replace the hardcoded mainnet passphrase with \`Networks.PUBLIC\`
- Replace the hardcoded testnet passphrase with \`Networks.TESTNET\`
- Add a startup check that logs the active network passphrase

## Acceptance Criteria
- No hardcoded network passphrase strings exist in the codebase
- \`Networks.PUBLIC\` and \`Networks.TESTNET\` are used exclusively
- The active network is logged at startup: \`Stellar network: TESTNET\`"

gh issue create --repo "$REPO" \
  --title "No data encryption at rest for sensitive patient fields" \
  --label "security" \
  --body "**Branch:** \`feat/field-level-encryption-phi\`
**Timeframe:** 5 days

## Description
Patient records store \`contactNumber\`, \`address\`, and \`dateOfBirth\` in plaintext in MongoDB. If the database is compromised, all PHI is immediately readable. HIPAA's Technical Safeguards (45 CFR § 164.312(a)(2)(iv)) require encryption of PHI at rest.

## Tasks
- Install \`mongoose-field-encryption\` or implement field-level encryption using Node's \`crypto\` module with AES-256-GCM
- Add \`FIELD_ENCRYPTION_KEY\` (32-byte hex string) to \`.env.example\` and config
- Encrypt the following fields before saving: \`contactNumber\`, \`address\`, \`dateOfBirth\`
- Decrypt transparently on read using Mongoose middleware
- Document the encryption approach and key rotation procedure in \`SECURITY.md\`

## Acceptance Criteria
- Raw MongoDB documents show encrypted (unreadable) values for \`contactNumber\`, \`address\`, \`dateOfBirth\`
- API responses return decrypted, human-readable values
- Rotating \`FIELD_ENCRYPTION_KEY\` has a documented migration procedure"

gh issue create --repo "$REPO" \
  --title "No input sanitization for XSS in stored text fields" \
  --label "security" \
  --body "**Branch:** \`feat/xss-input-sanitization\`
**Timeframe:** 1 day

## Description
Text fields like \`chiefComplaint\`, \`notes\`, \`treatmentPlan\`, and \`address\` are stored as-is and returned in API responses. If the web app ever renders these fields as HTML, stored XSS payloads like \`<script>alert(1)</script>\` would execute.

## Tasks
- Install \`dompurify\` (server-side via \`isomorphic-dompurify\`) or use a simple HTML-stripping utility
- Create \`apps/api/src/utils/sanitize.ts\` exporting a \`sanitizeText(input: string): string\` function
- Apply \`sanitizeText\` to all free-text fields before saving: \`chiefComplaint\`, \`notes\`, \`treatmentPlan\`, \`address\`, \`fullName\`

## Acceptance Criteria
- \`POST /encounters\` with \`notes: '<script>alert(1)</script>'\` stores the sanitized version, never the raw script tag
- Legitimate text with special characters (e.g. \`O'Brien\`, \`<3 mg/dL\`) is preserved correctly"

gh issue create --repo "$REPO" \
  --title "No password complexity enforcement beyond minimum length" \
  --label "security" \
  --body "**Branch:** \`feat/password-complexity-enforcement\`
**Timeframe:** 1 day

## Description
\`auth.validation.ts\` only enforces \`password.min(8)\`. A password of \`aaaaaaaa\` (8 identical characters) passes validation. For a healthcare application storing PHI, HIPAA guidelines recommend strong password policies.

## Tasks
- Update \`loginSchema\` and \`registerSchema\` to enforce: minimum 12 characters, at least one uppercase, one lowercase, one digit, one special character
- Check against a list of the top 1000 common passwords
- Return specific Zod error messages for each failed rule
- Add a password strength indicator to the registration form in the web app

## Acceptance Criteria
- \`password: 'aaaaaaaa'\` returns \`400\` with a message listing all unmet requirements
- \`password: 'Str0ng!Pass#2026'\` passes validation
- Common passwords like \`Password1!\` are rejected"

gh issue create --repo "$REPO" \
  --title "No multi-factor authentication (MFA)" \
  --label "security" \
  --body "**Branch:** \`feat/mfa-totp-authentication\`
**Timeframe:** 5 days

## Description
The API only supports email/password authentication. For a healthcare application with access to PHI, single-factor authentication is insufficient. A compromised password alone should not grant access to patient records.

## Tasks
- Add \`mfaEnabled: boolean\` (default: false) and \`mfaSecret: string\` (select: false) fields to \`UserModel\`
- Implement TOTP-based MFA using the \`otplib\` package
- Add \`POST /auth/mfa/setup\` — generates a TOTP secret and returns a QR code URI
- Add \`POST /auth/mfa/verify\` — verifies the TOTP code and enables MFA on the account
- Modify the login flow: if \`mfaEnabled\`, return \`{ mfaRequired: true, tempToken: string }\`
- Add \`POST /auth/mfa/challenge\` to receive the real tokens after TOTP verification

## Acceptance Criteria
- A user with MFA enabled cannot log in with only email/password — they receive \`mfaRequired: true\`
- \`POST /auth/mfa/challenge\` with a valid TOTP code returns \`accessToken\` and \`refreshToken\`
- The \`mfaSecret\` field is never returned in any API response"
