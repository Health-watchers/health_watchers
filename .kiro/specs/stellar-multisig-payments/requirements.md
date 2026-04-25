# Requirements Document

## Introduction

This feature adds multi-signature transaction support to the Health Watchers payment system. For high-value payments that exceed a per-clinic configurable threshold, two authorized signers must approve the Stellar transaction before it is submitted to the network. The feature introduces a multi-sig configuration model, a pending-signatures queue, a signing endpoint, and a Stellar account setup endpoint. It extends the existing `PaymentRecord` model to store transaction XDR and signature state, and adds in-app and email notifications to alert the second signer when their approval is required.

## Glossary

- **MultiSig_Config**: A per-clinic configuration document that controls whether multi-signature payments are enabled, the XLM threshold above which multi-sig is required, the number of required signers, and the list of authorized signer public keys.
- **Payment_Intent**: An existing `PaymentRecord` document in `pending` status that represents a payment awaiting submission to the Stellar network.
- **Transaction_XDR**: A base64-encoded Stellar transaction envelope that has been built but not yet submitted to Horizon.
- **Pending_Signature**: A `PaymentRecord` in `awaiting_signatures` status that holds a `Transaction_XDR` and is waiting for one or more additional authorized signers to sign it.
- **Authorized_Signer**: A Stellar public key listed in the clinic's `MultiSig_Config.authorizedSigners` array that is permitted to sign multi-sig transactions.
- **Stellar_Service**: The existing `apps/stellar-service` microservice responsible for all Stellar network interactions.
- **API**: The existing `apps/api` Express application that exposes REST endpoints.
- **Clinic_Admin**: A user with the `CLINIC_ADMIN` role who initiates payments and manages multi-sig configuration.
- **Doctor**: A user with the `DOCTOR` role who may act as a second authorized signer.
- **Horizon**: The Stellar HTTP API used for account loading and transaction submission.
- **XLM**: The native asset of the Stellar network.
- **USDC**: The USD Coin stablecoin asset on the Stellar network.
- **Account_Threshold**: A Stellar account-level setting (low, medium, high) that controls the minimum signing weight required to authorize different classes of operations.
- **Signing_Weight**: A numeric value assigned to each signer on a Stellar account that contributes toward meeting the account threshold.
- **Expiry_Window**: The 24-hour period after which an unsigned `Pending_Signature` is automatically expired and marked as `failed`.

---

## Requirements

### Requirement 1: Multi-Sig Configuration Per Clinic

**User Story:** As a clinic administrator, I want to configure multi-signature payment settings for my clinic, so that I can enforce dual-approval for high-value transactions.

#### Acceptance Criteria

1. THE System SHALL define a `MultiSig_Config` document per clinic with the following fields: `clinicId` (string, unique), `multiSigEnabled` (boolean, default `false`), `multiSigThreshold` (string, XLM amount, default `"1000"`), `requiredSigners` (number, default `2`), and `authorizedSigners` (array of Stellar public key strings).
2. WHEN a `MultiSig_Config` document is created or updated, THE System SHALL validate that every entry in `authorizedSigners` is a valid Stellar public key (56-character string starting with `G` using base32 alphabet).
3. WHEN a `MultiSig_Config` document is created or updated, THE System SHALL validate that `multiSigThreshold` is a positive numeric string with at most 7 decimal places.
4. WHEN a `MultiSig_Config` document is created or updated, THE System SHALL validate that `requiredSigners` is an integer greater than or equal to 2.
5. THE API SHALL expose a `GET /api/v1/payments/multisig/config` endpoint that returns the clinic's current `MultiSig_Config`, accessible to users with roles `CLINIC_ADMIN` or `SUPER_ADMIN`.
6. THE API SHALL expose a `PUT /api/v1/payments/multisig/config` endpoint that creates or replaces the clinic's `MultiSig_Config`, restricted to users with the `CLINIC_ADMIN` or `SUPER_ADMIN` role.
7. IF a user without `CLINIC_ADMIN` or `SUPER_ADMIN` role calls `PUT /api/v1/payments/multisig/config`, THEN THE API SHALL return a 403 error.
8. IF the `PUT /api/v1/payments/multisig/config` request body fails validation, THEN THE API SHALL return a 400 error with a structured message identifying the failing fields.

---

### Requirement 2: Multi-Sig Payment Initiation

**User Story:** As a clinic administrator, I want the system to automatically require a second signature for payments above the configured threshold, so that high-value transactions cannot be submitted unilaterally.

#### Acceptance Criteria

1. WHEN a `POST /api/v1/payments/intent` request is received and the clinic's `multiSigEnabled` is `true` and the payment `amount` exceeds `multiSigThreshold`, THE API SHALL build a Stellar transaction XDR via the `Stellar_Service` but SHALL NOT submit it to Horizon.
2. WHEN a multi-sig payment intent is created, THE System SHALL store the `Transaction_XDR` and the initiating signer's public key in the `PaymentRecord` and set the record's status to `awaiting_signatures`.
3. WHEN a multi-sig payment intent is created, THE System SHALL record the initiating signer's signature in a `signatures` array on the `PaymentRecord`, including the signer's public key and the timestamp of signing.
4. WHEN a payment `amount` is at or below `multiSigThreshold`, or when `multiSigEnabled` is `false`, THE System SHALL process the payment using the existing single-signature flow without modification.
5. WHEN a multi-sig payment intent is created, THE API SHALL return HTTP 202 with the `PaymentRecord` including `status: awaiting_signatures` and the `intentId`.
6. IF the clinic has no `MultiSig_Config` document, THEN THE System SHALL treat `multiSigEnabled` as `false` and process the payment using the single-signature flow.

---

### Requirement 3: Second Signer Notification

**User Story:** As an authorized signer, I want to be notified when a high-value transaction requires my signature, so that I can review and approve it promptly.

#### Acceptance Criteria

1. WHEN a multi-sig payment intent is created, THE System SHALL send an in-app notification to all `Authorized_Signer` users (matched by Stellar public key to user accounts) informing them that a transaction requires their signature.
2. WHEN a multi-sig payment intent is created, THE System SHALL send an email notification to all `Authorized_Signer` users informing them of the pending transaction, including the payment amount, destination, memo, and a link to the signing interface.
3. WHEN sending notifications, THE System SHALL exclude the initiating signer from the notification recipients.
4. IF no user account is found matching an `Authorized_Signer` public key, THEN THE System SHALL log a warning and continue without sending a notification for that signer.
5. THE notification email SHALL include: payment amount, asset code, destination public key, memo (if present), `intentId`, and a direct URL to `POST /api/v1/payments/:intentId/sign`.

---

### Requirement 4: Pending Signatures Queue

**User Story:** As an authorized signer, I want to see all transactions awaiting my signature, so that I can review and act on them without searching through all payments.

#### Acceptance Criteria

1. THE API SHALL expose a `GET /api/v1/payments/pending-signatures` endpoint that returns all `PaymentRecord` documents with `status: awaiting_signatures` scoped to the authenticated user's `clinicId`.
2. WHEN returning pending signature records, THE System SHALL include for each record: `intentId`, `amount`, `assetCode`, `destination`, `memo`, `createdAt`, `expiresAt`, and the list of `signatures` already collected.
3. THE `GET /api/v1/payments/pending-signatures` endpoint SHALL be accessible to users with roles `CLINIC_ADMIN`, `SUPER_ADMIN`, or `DOCTOR`.
4. IF a user without `CLINIC_ADMIN`, `SUPER_ADMIN`, or `DOCTOR` role calls `GET /api/v1/payments/pending-signatures`, THEN THE API SHALL return a 403 error.
5. THE System SHALL order the pending signatures list by `createdAt` ascending so that the oldest pending transactions appear first.

---

### Requirement 5: Sign Transaction Endpoint

**User Story:** As an authorized signer, I want to sign a pending transaction, so that it can be submitted to the Stellar network once all required signatures are collected.

#### Acceptance Criteria

1. THE API SHALL expose a `POST /api/v1/payments/:intentId/sign` endpoint that accepts a `signerPublicKey` field in the request body.
2. WHEN a sign request is received, THE System SHALL verify that `signerPublicKey` is present in the clinic's `MultiSig_Config.authorizedSigners` list.
3. WHEN a sign request is received, THE System SHALL verify that the `PaymentRecord` with the given `intentId` has `status: awaiting_signatures` and belongs to the authenticated user's `clinicId`.
4. WHEN a sign request is received, THE System SHALL verify that `signerPublicKey` has not already signed this transaction (no duplicate signatures).
5. WHEN a valid sign request is received, THE System SHALL add the signer's public key and timestamp to the `signatures` array on the `PaymentRecord`.
6. WHEN the number of collected signatures equals `MultiSig_Config.requiredSigners`, THE System SHALL call the `Stellar_Service` to combine the signatures and submit the transaction to Horizon.
7. WHEN the transaction is successfully submitted after all signatures are collected, THE System SHALL update the `PaymentRecord` status to `submitted` and record the `txHash` and `submittedAt`.
8. IF the `intentId` does not exist or belongs to a different clinic, THEN THE API SHALL return a 404 error.
9. IF the `signerPublicKey` is not in `authorizedSigners`, THEN THE API SHALL return a 403 error with a message indicating the key is not authorized.
10. IF the `signerPublicKey` has already signed this transaction, THEN THE API SHALL return a 409 error with a message indicating a duplicate signature.
11. IF the `PaymentRecord` status is not `awaiting_signatures`, THEN THE API SHALL return a 400 error indicating the transaction is not in a signable state.
12. IF the Stellar network submission fails after all signatures are collected, THEN THE System SHALL update the `PaymentRecord` status to `failed` and record the `failureReason`.

---

### Requirement 6: Transaction Expiry

**User Story:** As a clinic administrator, I want pending multi-sig transactions to expire automatically if not signed within 24 hours, so that stale unsigned transactions do not accumulate indefinitely.

#### Acceptance Criteria

1. WHEN a multi-sig payment intent is created, THE System SHALL set an `expiresAt` field on the `PaymentRecord` to 24 hours after `createdAt`.
2. WHEN a `POST /api/v1/payments/:intentId/sign` request is received and the current time is past `expiresAt`, THE System SHALL reject the request with a 410 error and update the `PaymentRecord` status to `expired`.
3. THE System SHALL run a background job that periodically scans for `PaymentRecord` documents with `status: awaiting_signatures` and `expiresAt` in the past, and updates their status to `expired`.
4. WHEN a `PaymentRecord` is expired by the background job, THE System SHALL log the expiry at `info` level including the `intentId`, `clinicId`, and `expiresAt`.
5. THE `expired` status SHALL be a terminal state; an expired `PaymentRecord` SHALL NOT be transitioned to any other status.

---

### Requirement 7: Stellar Account Multi-Sig Setup

**User Story:** As a clinic administrator, I want to configure my clinic's Stellar account to require multiple signers at the network level, so that the on-chain account enforces the same multi-sig policy as the application.

#### Acceptance Criteria

1. THE API SHALL expose a `POST /api/v1/payments/setup-multisig` endpoint that accepts `additionalSigners` (array of `{ publicKey: string; weight: number }`) and `thresholds` (`{ low: number; medium: number; high: number }`).
2. WHEN a `POST /api/v1/payments/setup-multisig` request is received, THE Stellar_Service SHALL build and sign a `setOptions` transaction that adds each additional signer with the specified weight and sets the account's low, medium, and high thresholds.
3. WHEN the `setOptions` transaction is successfully submitted, THE API SHALL return HTTP 200 with the transaction hash.
4. THE `POST /api/v1/payments/setup-multisig` endpoint SHALL be restricted to users with the `CLINIC_ADMIN` or `SUPER_ADMIN` role.
5. IF a user without `CLINIC_ADMIN` or `SUPER_ADMIN` role calls `POST /api/v1/payments/setup-multisig`, THEN THE API SHALL return a 403 error.
6. IF the `setOptions` transaction fails on Horizon, THEN THE API SHALL return a 502 error with the Horizon error details.
7. WHEN building the `setOptions` transaction, THE Stellar_Service SHALL use the clinic's existing master keypair (stored as `stellarSecretKey` in the service configuration) to sign the transaction.

---

### Requirement 8: PaymentRecord Multi-Sig Extension

**User Story:** As a developer, I want the `PaymentRecord` model to store multi-sig state, so that the system can track XDR, signatures, and expiry without a separate collection.

#### Acceptance Criteria

1. THE System SHALL extend the existing `PaymentRecord` schema with the following optional fields: `transactionXdr` (string), `signatures` (array of `{ signerPublicKey: string; signedAt: Date }`), `expiresAt` (Date), and `multiSigRequired` (boolean, default `false`).
2. THE `PaymentRecord` status enum SHALL be extended to include `awaiting_signatures` and `expired` in addition to the existing `pending`, `confirmed`, and `failed` values.
3. WHEN a `PaymentRecord` has `multiSigRequired: true`, THE System SHALL ensure `transactionXdr` is populated before the record is saved with `status: awaiting_signatures`.
4. THE System SHALL add an index on `{ clinicId: 1, status: 1, expiresAt: 1 }` to the `PaymentRecord` schema to support efficient expiry scanning.
5. THE System SHALL add an index on `{ status: 1, expiresAt: 1 }` to the `PaymentRecord` schema to support the background expiry job.

---

### Requirement 9: Multi-Sig Tests

**User Story:** As a developer, I want comprehensive tests covering the multi-sig payment flow, so that I can be confident the feature behaves correctly across all scenarios.

#### Acceptance Criteria

1. THE Test_Suite SHALL include a test verifying that a payment below the threshold follows the single-signature flow and is submitted immediately.
2. THE Test_Suite SHALL include a test verifying the complete multi-sig flow: initiation → pending → second signature → submission.
3. THE Test_Suite SHALL include a test verifying that a `Pending_Signature` that is not signed within 24 hours is expired by the background job.
4. THE Test_Suite SHALL include property-based tests for the signature collection logic, verifying that the transaction is submitted if and only if the number of collected signatures equals `requiredSigners`.
5. THE Test_Suite SHALL include property-based tests for the expiry logic, verifying that any `PaymentRecord` with `expiresAt` in the past and `status: awaiting_signatures` is transitioned to `expired`.
