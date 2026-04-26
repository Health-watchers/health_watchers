# Implementation Plan: Stellar Multi-Signature Payments

## Tasks

- [ ] 1. Extend data models
  - [ ] 1.1 Add `multiSigEnabled`, `multiSigThreshold`, `requiredSigners`, `authorizedSigners` fields to `apps/api/src/modules/clinics/clinic-settings.model.ts`
    - _Requirements: 1.1_
  - [ ] 1.2 Add `transactionXdr`, `signatures`, `expiresAt` fields and `pending_signatures` / `expired` to the status enum in the PaymentRecord model
    - _Requirements: 2.1, 2.2, 2.5_

- [ ] 2. Extend payments service with multi-sig logic
  - [ ] 2.1 Update `createPaymentIntent` in `payments.service.ts`: after building the Stellar transaction, check if `multiSigEnabled && amount > multiSigThreshold`. If true: store XDR in PaymentRecord with `status: pending_signatures`, set `expiresAt = now + 24h`, call notification service. If false: submit immediately as before.
    - _Requirements: 1.2, 1.3, 2.1, 2.2, 2.3_
  - [ ]* 2.2 Write property test: below-threshold bypasses multi-sig (Property 1)
    - **Validates: Requirements 1.2, 1.3**
  - [ ]* 2.3 Write property test: above-threshold stores XDR (Property 2)
    - **Validates: Requirements 2.1, 2.2**
  - [ ] 2.4 Add `signTransaction(intentId, signedXdr, user)` to payments service: verify not expired (422 if so), verify user public key in `authorizedSigners` (403 if not), merge signature into `signatures` array, if `signatures.length >= requiredSigners` submit to Stellar and set status `completed`, else save updated XDR.
    - _Requirements: 5.1–5.5_
  - [ ]* 2.5 Write property test: signature collection and submission (Property 3)
    - **Validates: Requirements 2.4, 5.3**
  - [ ]* 2.6 Write property test: expiry invariant (Property 4)
    - **Validates: Requirements 2.5, 5.4**
  - [ ]* 2.7 Write property test: authorized signer enforcement (Property 5)
    - **Validates: Requirements 5.5**

- [ ] 3. Implement expiry job
  - [ ] 3.1 Create `apps/api/src/modules/payments/multisig-expiry.job.ts`: a function that queries `PaymentRecord.find({ status: 'pending_signatures', expiresAt: { $lt: new Date() } })` and bulk-updates them to `status: expired`. Register it to run every 5 minutes via the existing cron setup.
    - _Requirements: 2.5_

- [ ] 4. Implement API endpoints
  - [ ] 4.1 Add `POST /setup-multisig` to `payments.routes.ts`: auth `CLINIC_ADMIN`, call Stellar SDK to add signers and set thresholds using provided `masterKey`.
    - _Requirements: 3.1, 3.2, 3.3, 3.4_
  - [ ] 4.2 Add `GET /pending-signatures` to `payments.routes.ts`: auth `CLINIC_ADMIN | DOCTOR`, query PaymentRecords with `status: pending_signatures` scoped to clinic, return with `expiresAt` and signature count.
    - _Requirements: 4.1, 4.2, 4.3_
  - [ ] 4.3 Add `POST /:intentId/sign` to `payments.routes.ts`: auth `CLINIC_ADMIN | DOCTOR`, call `paymentsService.signTransaction()`, return 200 with updated record or 422/403 on error.
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_

- [ ] 5. Notify second signer
  - [ ] 5.1 Call `notificationService.send()` and `emailService.send()` after storing the pending XDR, passing transaction details (amount, destination, memo) to the second authorized signer.
    - _Requirements: 2.3_

- [ ] 6. Final checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked `*` are optional
- Use `StellarSdk.TransactionBuilder.fromXDR()` and `transaction.sign(keypair)` for XDR merging
- The `masterKey` in setup-multisig should never be logged or stored
- Property tests use `fast-check`
