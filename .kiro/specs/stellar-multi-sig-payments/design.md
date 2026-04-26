# Design Document: Stellar Multi-Signature Payments

## Overview

Extends the existing Stellar payments module to support multi-sig transactions for high-value payments. When a payment exceeds the clinic's configured threshold, the transaction XDR is stored pending a second signature. A background job expires unsigned transactions after 24 hours.

## Architecture

```
CLINIC_ADMIN creates payment intent (amount > threshold)
  → payments.service.ts builds XDR, stores in PaymentRecord (status: pending_signatures)
  → notification.service.ts notifies second signer (in-app + email)

Second signer calls POST /payments/:intentId/sign
  → payments.service.ts adds signature to XDR
  → if signatures >= requiredSigners: submit to Stellar, status → completed

Cron job (every 5 min): expire PaymentRecords where status=pending_signatures AND createdAt < now-24h
```

## Data Model Changes

### ClinicSettings additions
```typescript
multiSigEnabled: boolean;          // default false
multiSigThreshold: string;         // XLM amount string e.g. "1000"
requiredSigners: number;           // default 2
authorizedSigners: string[];       // Stellar public keys
```

### PaymentRecord additions
```typescript
transactionXdr?: string;           // unsigned/partially-signed XDR
signatures: Array<{ publicKey: string; signature: string; signedAt: Date }>;
status: ... | 'pending_signatures' | 'expired';
expiresAt?: Date;                  // createdAt + 24h for multi-sig payments
```

## API Endpoints

### POST /api/v1/payments/setup-multisig
- Auth: `CLINIC_ADMIN`
- Body: `{ masterKey: string, additionalSigners: string[], thresholds: { low, medium, high } }`
- Calls Stellar SDK to add signers and set thresholds on the clinic's account
- Returns 200 on success

### GET /api/v1/payments/pending-signatures
- Auth: `CLINIC_ADMIN | DOCTOR`
- Returns: `PaymentRecord[]` with status `pending_signatures`, scoped to clinic
- Includes `amount`, `destination`, `memo`, `createdAt`, `expiresAt`, `signatures` count

### POST /api/v1/payments/:intentId/sign
- Auth: `CLINIC_ADMIN | DOCTOR` (must be in `authorizedSigners`)
- Body: `{ signedXdr: string }` — the signer's signed XDR
- Merges signatures; if count >= `requiredSigners`, submits to Stellar
- Returns 422 if expired, 403 if not an authorized signer

## Correctness Properties

### Property 1: Below-threshold payments bypass multi-sig
For any payment where `amount <= multiSigThreshold` OR `multiSigEnabled = false`, the transaction must be submitted immediately without storing XDR or requiring a second signature.
**Validates: Requirements 1.2, 1.3**

### Property 2: Above-threshold payments store XDR
For any payment where `amount > multiSigThreshold` AND `multiSigEnabled = true`, the PaymentRecord must have status `pending_signatures` and a non-null `transactionXdr` after creation. No Stellar submission must occur.
**Validates: Requirements 2.1, 2.2**

### Property 3: Signature collection and submission
For any multi-sig PaymentRecord, the transaction must only be submitted to Stellar when `signatures.length >= requiredSigners`. Submission with fewer signatures must never occur.
**Validates: Requirements 2.4, 5.3**

### Property 4: Expiry invariant
For any `pending_signatures` PaymentRecord where `now > expiresAt`, the sign endpoint must return 422 and must not submit the transaction.
**Validates: Requirements 2.5, 5.4**

### Property 5: Authorized signer enforcement
For any sign request from a user whose Stellar public key is not in `authorizedSigners`, the endpoint must return 403 and must not add a signature.
**Validates: Requirements 5.5**

## Testing Strategy

- Unit: `payments.service.ts` — test threshold check, XDR storage, signature merging, submission trigger
- Unit: expiry job — test records past 24h are marked expired
- PBT (fast-check): Properties 1–5 above
- Integration: full single-sig flow (below threshold), full multi-sig flow (above threshold), timeout/expiry flow
