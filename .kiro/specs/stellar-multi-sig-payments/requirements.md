# Requirements Document

## Introduction

For high-value Stellar payments above a configurable per-clinic threshold, two authorized signers must approve the transaction before it is submitted to the network. This feature adds multi-sig configuration, a pending signatures queue, a sign transaction endpoint, and expiry of unsigned transactions after 24 hours.

## Requirements

### Requirement 1: Multi-sig Configuration

**User Story:** As a clinic admin, I want to configure multi-sig thresholds and authorized signers, so that high-value payments require dual approval.

#### Acceptance Criteria

1. THE clinic settings SHALL include `multiSigEnabled: boolean`, `multiSigThreshold: string` (XLM amount), `requiredSigners: number` (default 2), and `authorizedSigners: string[]` (Stellar public keys).
2. WHEN `multiSigEnabled` is false, ALL payments SHALL be processed as single-sig regardless of amount.
3. WHEN a payment amount exceeds `multiSigThreshold` and `multiSigEnabled` is true, THE system SHALL require multi-sig approval.

---

### Requirement 2: Multi-sig Payment Flow

**User Story:** As a clinic admin, I want high-value payments to require a second signer, so that large transactions cannot be submitted unilaterally.

#### Acceptance Criteria

1. WHEN a payment intent is created with amount > `multiSigThreshold`, THE system SHALL build the Stellar transaction XDR but NOT submit it.
2. THE transaction XDR SHALL be stored in the `PaymentRecord` with status `pending_signatures`.
3. WHEN the XDR is stored, THE system SHALL notify the second authorized signer via in-app notification and email.
4. WHEN all required signatures are collected, THE system SHALL combine signatures and submit the transaction to Stellar.
5. WHEN a `pending_signatures` transaction is not fully signed within 24 hours, THE system SHALL mark it as `expired` and SHALL NOT submit it.

---

### Requirement 3: Multi-sig Setup Endpoint

**User Story:** As a clinic admin, I want to configure the clinic's Stellar account for multi-sig, so that the account enforces signature thresholds on-chain.

#### Acceptance Criteria

1. THE system SHALL expose `POST /api/v1/payments/setup-multisig`.
2. WHEN called, THE endpoint SHALL add additional signers to the clinic's Stellar account and set low/medium/high thresholds.
3. THE endpoint SHALL require the current master key to authorize the operation.
4. THE endpoint SHALL require the `CLINIC_ADMIN` role.

---

### Requirement 4: Pending Signatures Queue

**User Story:** As an authorized signer, I want to see transactions awaiting my signature, so that I can review and approve high-value payments.

#### Acceptance Criteria

1. THE system SHALL expose `GET /api/v1/payments/pending-signatures`.
2. THE endpoint SHALL return all `pending_signatures` transactions for the authenticated clinic, including `amount`, `destination`, `memo`, `createdAt`, and `expiresAt`.
3. THE endpoint SHALL require the `CLINIC_ADMIN` or `DOCTOR` role.

---

### Requirement 5: Sign Transaction Endpoint

**User Story:** As an authorized signer, I want to sign a pending transaction, so that it can be submitted once all signatures are collected.

#### Acceptance Criteria

1. THE system SHALL expose `POST /api/v1/payments/:intentId/sign`.
2. WHEN called by an authorized signer, THE endpoint SHALL add the signer's signature to the transaction XDR.
3. WHEN the required number of signatures is reached, THE endpoint SHALL submit the transaction to Stellar and update the `PaymentRecord` status to `completed`.
4. WHEN the transaction has expired, THE endpoint SHALL return a 422 response.
5. THE endpoint SHALL require the requesting user to be in `authorizedSigners` for the clinic.
