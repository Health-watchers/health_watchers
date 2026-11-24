# Stellar Multi-Signature Payments — Design

## Overview

Large payments require multiple approvals before they can be submitted to the Stellar network. This document describes the multi-signature workflow: who signs, what thresholds apply, how transactions are built and collected, how signers are notified, and how stale transactions are automatically voided.

The implementation lives primarily in `stellar.ts` (transaction building and submission) and the payments API (approval queue, signing, and expiry job).

## Signers and Thresholds

### Signer model

A Stellar account is configured with a set of signers. Each signer has a **weight** (0–255). The account also defines three thresholds:

| Threshold | Purpose | Typical use |
|-----------|---------|-------------|
| `low`     | Allow payments, manage offers, etc. | Small day-to-day operations |
| `medium`  | Allow trustlines, manage data, etc. | Standard operations |
| `high`    | Allow account merge, set options, change signers | Critical operations |

A transaction is authorized when the **sum of weights of the signers who signed** meets or exceeds the threshold required for that operation.

### Default configuration

The platform supports configurable signer sets. Two common configurations are:

**2-of-3 (default for standard accounts)**
- 3 signers, each with weight 1
- `low = 1`, `medium = 2`, `high = 2`
- Any 2 of the 3 signers can authorize a payment

**3-of-5 (high-value accounts)**
- 5 signers, each with weight 1
- `low = 1`, `medium = 3`, `high = 3`
- Any 3 of the 5 signers can authorize a payment

Signers are identified by their Stellar public key (`G...`). The platform's own signing key is always one of the signers so it can co-sign transactions it builds.

### Threshold selection for payments

Payments use the `medium` threshold. The required number of signatures is derived from the account's signer configuration:

- `requiredSignatures = mediumThreshold` (when all signers have weight 1)
- More generally, the platform computes the minimum number of signers whose combined weight meets the `medium` threshold.

## Workflow

### 1. Payment intent creation

A payment is created via the payments API. If the destination account is configured for multi-sig (or the amount exceeds the single-signature limit), the payment is created in `pending_signatures` status instead of being submitted immediately.

The payment record stores:
- `id`, `amount`, `asset`, `destination`, `memo`
- `status` = `pending_signatures`
- `requiredSignatures` — number of signatures needed
- `collectedSignatures` — array of `{ signer, signature, signedAt }`
- `expiresAt` — `createdAt + 24h`
- `xdr` — the base64-encoded transaction envelope awaiting signatures

### 2. Transaction building (`stellar.ts`)

`buildMultiSigTransaction(payment)`:
1. Loads the source account from Horizon to obtain the current sequence number.
2. Builds a `Payment` operation (or path payment for non-native assets).
3. Sets `timeBounds` with `maxTime = expiresAt` so the network rejects the transaction after the 24-hour window even if it is submitted late.
4. Wraps the transaction in a `TransactionBuilder` and produces the base64 XDR envelope.
5. Persists the XDR on the payment record.

The platform co-signs with its own key at build time, contributing its weight toward the threshold.

### 3. Signer notification

When a payment enters `pending_signatures`, the notification service notifies all eligible signers (excluding those who have already signed). Each notification includes:
- Payment id, amount, asset, destination
- Number of signatures still required
- Expiry timestamp
- A deep link to the approval queue

Notifications are sent through the existing notification service (`notifySigners(payment, signers)`), which fans out to each signer's configured channels (email, in-app, push).

### 4. Signature collection

Signers submit signatures via the approval endpoint. Each submission:
1. Validates the payment is still `pending_signatures` and not expired.
2. Validates the signer is an authorized signer for the account.
3. Validates the signature against the transaction hash.
4. Appends the signature to `collectedSignatures` (idempotent — re-submitting the same signer's signature is a no-op).
5. If `collectedSignatures.length >= requiredSignatures`, transitions the payment to `submitting` and calls `submitMultiSigTransaction`.

### 5. Submission

`submitMultiSigTransaction(payment)`:
1. Decodes the stored XDR.
2. Adds all collected signatures to the envelope.
3. Submits to Horizon via `server.submitTransaction`.
4. On success, sets status to `completed` and stores the transaction hash.
5. On failure, records the Horizon error and leaves the payment in `pending_signatures` (if retryable) or marks it `failed`.

### 6. 24-hour auto-void expiry job

A scheduled job runs periodically (every 15 minutes) and:
1. Queries payments with `status = pending_signatures` and `expiresAt < now`.
2. Sets their status to `voided` and records `voidedAt` and `voidReason = 'expired'`.
3. Notifies the original creator and any signers who had signed that the payment expired.

Because the transaction's `timeBounds.maxTime` equals `expiresAt`, an expired transaction cannot be submitted to the network even if a late signature arrives — the network rejects it. The job keeps the database consistent with the network.

## API Endpoints

### `POST /payments/:id/setup-multisig`

Configures the multi-signature signer set and thresholds on the source account (or records the intended configuration for the payment). Body:

```json
{
  "signers": [
    { "key": "G...", "weight": 1 },
    { "key": "G...", "weight": 1 },
    { "key": "G...", "weight": 1 }
  ],
  "thresholds": { "low": 1, "medium": 2, "high": 2 }
}
```

Returns the resulting account signer configuration. Requires the `high` threshold to be met by the current signers.

### `GET /payments/pending-signatures`

Returns the approval queue: all payments in `pending_signatures` status visible to the requesting signer, including amount, destination, required vs. collected signature counts, and expiry.

### `POST /payments/:id/sign` (alias: `POST /payments/:id/approve`)

Submits a signature for a pending payment. Body:

```json
{ "signer": "G...", "signature": "base64..." }
```

Behavior:
- Validates signer authorization and signature correctness.
- Appends the signature (idempotent).
- If the threshold is now met, submits the transaction and returns the resulting status (`completed` or `failed`).
- Otherwise returns the updated `collectedSignatures` count and remaining signatures needed.

Errors:
- `404` — payment not found
- `409` — payment not in `pending_signatures` (already completed, voided, or failed)
- `410` — payment expired
- `422` — signer not authorized or invalid signature

## Data Model

```
Payment {
  id
  amount
  asset
  destination
  memo
  status: 'pending' | 'pending_signatures' | 'submitting' | 'completed' | 'failed' | 'voided'
  requiredSignatures: number
  collectedSignatures: { signer: string, signature: string, signedAt: Date }[]
  xdr: string
  expiresAt: Date
  voidedAt?: Date
  voidReason?: string
  txHash?: string
}
```

## Testing

Tests cover:
- **2-of-3**: transaction builds, two signatures satisfy the medium threshold, submission succeeds; a single signature does not submit.
- **3-of-5**: three signatures satisfy the threshold; two do not.
- **Expiry**: a payment past `expiresAt` is voided by the job and cannot be signed or submitted.
- **Idempotency**: re-submitting the same signer's signature does not double-count.
- **Authorization**: unauthorized signers are rejected with `422`.