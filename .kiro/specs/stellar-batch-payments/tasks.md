# Implementation Plan: Stellar Batch Payments

## Overview

Implement batch payment processing for the Health Watchers platform. Tasks follow the data flow: model → validation → stellar-service → API controller → frontend UI.

## Tasks

- [ ] 1. BatchPayment model and PaymentRecord extension
  - Create `apps/api/src/modules/payments/models/batch-payment.model.ts` with the `BatchPayment` interface and Mongoose schema (fields: `batchId`, `clinicId`, `createdBy`, `payments`, `status`, `currency`, `totalAmount`, optional `txHash`, `submittedAt`, `confirmedAt`, `failureReason`)
  - Add indexes on `batchId` (unique), `clinicId`, `status`, and compound `{ clinicId, createdAt }`
  - Add optional `batchId` field to the existing `PaymentRecord` schema in `apps/api/src/modules/payments/models/payment-record.model.ts`
  - _Requirements: 4.1, 4.2, 4.7, 5.3_

  - [ ]* 1.1 Write property test for BatchPayment totalAmount computation
    - **Property 1: Valid batch creates pending record with correct totalAmount**
    - **Validates: Requirements 1.2, 4.3**
    - Generate random arrays of 1–100 valid amounts, create a BatchPayment, verify `totalAmount` equals the sum to 7 decimal places
    - Tag: `Feature: stellar-batch-payments, Property 1: Valid batch creates pending record with correct totalAmount`

  - [ ]* 1.2 Write property test for BatchPayment state machine
    - **Property 9: BatchPayment state machine transitions are monotonic**
    - **Validates: Requirements 4.4, 4.5, 4.6**
    - Generate random valid status sequences and verify only forward transitions are accepted; verify confirmed/failed are terminal states
    - Tag: `Feature: stellar-batch-payments, Property 9: BatchPayment state machine transitions are monotonic`

- [ ] 2. Batch request validation
  - Create `apps/api/src/modules/payments/batch.validation.ts` with Zod schemas: `paymentInstructionSchema` (destination regex, amount regex, memo byte-length refine) and `createBatchSchema` (array min 1 max 100, currency enum)
  - Export `CreateBatchDto`, `ListBatchQueryDto` types
  - _Requirements: 1.3, 1.4, 1.5, 2.1, 2.2, 2.3_

  - [ ]* 2.1 Write property test for destination address validation
    - **Property 3: Destination address validation rejects invalid keys**
    - **Validates: Requirements 2.1, 2.6**
    - Generate random strings that are not valid Stellar public keys and verify the schema rejects them; generate valid keys and verify acceptance
    - Tag: `Feature: stellar-batch-payments, Property 3: Destination address validation rejects invalid keys`

  - [ ]* 2.2 Write property test for amount validation
    - **Property 4: Amount validation rejects malformed values**
    - **Validates: Requirements 2.2, 2.6**
    - Generate negative numbers, zero, non-numeric strings, and amounts with >7 decimal places; verify all are rejected
    - Tag: `Feature: stellar-batch-payments, Property 4: Amount validation rejects malformed values`

  - [ ]* 2.3 Write property test for memo byte-length validation
    - **Property 5: Memo byte-length validation**
    - **Validates: Requirements 2.3, 2.6**
    - Generate strings including multi-byte UTF-8 characters (emoji, CJK) where byte length > 28 but character count ≤ 28; verify rejection
    - Tag: `Feature: stellar-batch-payments, Property 5: Memo byte-length validation`

- [ ] 3. Stellar service batch endpoint
  - Add `buildAndSubmitBatch(sourcePublicKey, operations)` function to `apps/stellar-service/src/stellar.ts` that loads the account once, builds a `TransactionBuilder` with one `Operation.payment` per instruction, signs, and submits to Horizon
  - Add `POST /batch` protected endpoint to `apps/stellar-service/src/index.ts` that calls `buildAndSubmitBatch` and returns `{ txHash, submittedAt }`
  - Enforce the 100-operation limit in `buildAndSubmitBatch` (throw if exceeded)
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7_

  - [ ]* 3.1 Write property test for batch transaction operation count
    - **Property 8: Batch transaction operation count matches instruction count**
    - **Validates: Requirements 3.1, 3.4**
    - Mock Horizon `loadAccount` and `submitTransaction`; generate random arrays of 1–100 valid operations; verify the built transaction has exactly N operations
    - Tag: `Feature: stellar-batch-payments, Property 8: Batch transaction operation count matches instruction count`

- [ ] 4. Stellar client extension
  - Add `submitBatch(params)` method to the `StellarClient` class in `apps/api/src/modules/payments/services/stellar-client.ts` that calls `POST /batch` on the stellar-service with the shared secret header
  - _Requirements: 3.2_

- [ ] 5. Checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 6. Batch API controller
  - Create `apps/api/src/modules/payments/batch.controller.ts` with an Express router
  - Implement `POST /` handler: authenticate, check role (CLINIC_ADMIN/SUPER_ADMIN), validate with `createBatchSchema`, check for duplicate destinations, check balance via `stellarClient.getBalance`, create `BatchPayment` (status: pending), call `stellarClient.submitBatch`, update `BatchPayment` (status: submitted, txHash, submittedAt), then trigger confirmation polling
  - Implement `GET /` handler: paginated list scoped to `clinicId`, support `status`/`page`/`limit` query params
  - Implement `GET /:batchId` handler: find by `batchId` and `clinicId`, return 404 if not found
  - Return structured `BatchValidationError` responses for all validation failures (with `details` array of `{ index, field, message }`)
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 2.4, 2.5, 2.6, 2.7, 6.1, 6.2, 6.3, 6.4, 6.5, 6.6_

  - [ ]* 6.1 Write property test for RBAC on batch submission
    - **Property 2: Role-based access control on batch submission**
    - **Validates: Requirements 1.6, 1.7**
    - Generate random roles that are not CLINIC_ADMIN or SUPER_ADMIN; verify POST /batch returns 403 for each
    - Tag: `Feature: stellar-batch-payments, Property 2: Role-based access control on batch submission`

  - [ ]* 6.2 Write property test for duplicate destination rejection
    - **Property 6: Duplicate destination rejection**
    - **Validates: Requirements 2.5, 2.6**
    - Generate batches with at least two instructions sharing the same destination; verify 400 with structured error identifying duplicate indices
    - Tag: `Feature: stellar-batch-payments, Property 6: Duplicate destination rejection`

  - [ ]* 6.3 Write property test for no DB records on validation failure
    - **Property 7: No database records created on validation failure**
    - **Validates: Requirements 2.7**
    - Generate invalid batches (various failure modes); verify BatchPayment count in DB is unchanged after each request
    - Tag: `Feature: stellar-batch-payments, Property 7: No database records created on validation failure`

  - [ ]* 6.4 Write property test for cross-clinic isolation
    - **Property 11: Cross-clinic batch isolation**
    - **Validates: Requirements 6.2, 6.3**
    - Create batches for clinic A; authenticate as clinic B; verify GET /:batchId returns 404 for all clinic A batches
    - Tag: `Feature: stellar-batch-payments, Property 11: Cross-clinic batch isolation`

- [ ] 7. Confirmation and PaymentRecord creation
  - Add a `confirmBatch(batchId)` function (or inline in the controller) that polls `stellarClient.verifyTransaction(txHash)` until confirmed, then updates `BatchPayment` to `confirmed` and calls `PaymentRecordModel.insertMany` to create one record per instruction
  - Each created `PaymentRecord` must have: `status: confirmed`, `txHash`, `confirmedAt`, `clinicId`, `batchId`, `intentId` (generate a UUID per instruction), `amount`, `destination`, `memo`, `assetCode`
  - Wrap `insertMany` in a try/catch; on failure log the error at `error` level and leave `BatchPayment` in `confirmed` status
  - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_

  - [ ]* 7.1 Write property test for confirmed batch PaymentRecord creation
    - **Property 10: Confirmed batch produces correct PaymentRecord count and fields**
    - **Validates: Requirements 5.1, 5.2, 5.3**
    - Generate random confirmed batches of N instructions; verify exactly N PaymentRecords are created with correct txHash, confirmedAt, clinicId, batchId, and status
    - Tag: `Feature: stellar-batch-payments, Property 10: Confirmed batch produces correct PaymentRecord count and fields`

- [ ] 8. Wire batch routes into the payments router
  - Import `batchRoutes` from `batch.controller.ts` in `apps/api/src/modules/payments/payments.routes.ts`
  - Mount at `/batch` so routes resolve to `/api/v1/payments/batch`
  - _Requirements: 1.1, 6.1, 6.4_

- [ ] 9. Checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 10. CSV parser utility
  - Create `apps/web/src/lib/parseBatchCsv.ts` that parses a CSV string into `PaymentInstruction[]`
  - Validate each row: destination must match `/^G[A-Z2-7]{55}$/`, amount must be a positive numeric string, memo byte length must not exceed 28
  - Return `{ valid: PaymentInstruction[], errors: Array<{ row: number; field: string; message: string }> }`
  - Reject (return error) if more than 100 rows are present
  - _Requirements: 7.1, 7.2, 7.3, 7.4_

  - [ ]* 10.1 Write property test for CSV parser memo byte-length enforcement
    - **Property 12: CSV parser memo byte-length enforcement**
    - **Validates: Requirements 7.3**
    - Generate CSV rows with memos containing multi-byte UTF-8 characters where byte length > 28; verify the parser marks those rows as invalid
    - Tag: `Feature: stellar-batch-payments, Property 12: CSV parser memo byte-length enforcement`

- [ ] 11. CsvUpload component
  - Create `apps/web/src/components/payments/CsvUpload.tsx` that renders a file input accepting `.csv` files
  - On file selection, read the file as text, call `parseBatchCsv`, and pass results to a parent callback
  - Display inline row-level errors from the parser
  - Include a download link for a CSV template (`destination,amount,memo\nGABC...,10.0000000,example`)
  - _Requirements: 7.1, 7.2, 7.3, 7.5_

- [ ] 12. BatchPreview component
  - Create `apps/web/src/components/payments/BatchPreview.tsx` that accepts `PaymentInstruction[]`, `currency`, and `availableBalance`
  - Display a table of all instructions (destination, amount, memo)
  - Display total payment count and computed `totalAmount` (sum of amounts to 7 decimal places)
  - Display available balance and a visual indicator (green/red) for whether balance is sufficient
  - Render a "Submit Batch" button and a "Back" button; call `onSubmit` callback on confirm
  - _Requirements: 8.1, 8.2, 8.3, 8.4_

  - [ ]* 12.1 Write property test for BatchPreview totalAmount computation
    - **Property 13: Batch preview totalAmount equals sum of instruction amounts**
    - **Validates: Requirements 8.2**
    - Generate random arrays of valid amounts; render BatchPreview; verify displayed total equals arithmetic sum to 7 decimal places
    - Tag: `Feature: stellar-batch-payments, Property 13: Batch preview totalAmount equals sum of instruction amounts`

- [ ] 13. Batch payment page (upload + preview)
  - Create `apps/web/src/app/payments/batch/page.tsx` (server component) and `BatchPaymentClient.tsx` (client component)
  - `BatchPaymentClient` manages state: `idle` → `preview` → `submitting` → `submitted`
  - In `idle` state: render `CsvUpload` and a manual-entry form (destination, amount, memo fields with an "Add" button)
  - In `preview` state: render `BatchPreview` with parsed instructions and fetched balance
  - On submit: call `POST /api/v1/payments/batch`, navigate to `/payments/batch/:batchId` on success, display API error on failure
  - _Requirements: 7.1, 7.2, 8.1, 8.2, 8.3, 8.4, 8.5, 8.6_

- [ ] 14. BatchStatusTable component
  - Create `apps/web/src/components/payments/BatchStatusTable.tsx` that accepts a `BatchPayment` and renders a table of all `payments` with columns: destination, amount, memo, and status (derived from the batch status — all confirmed if batch is confirmed, all failed if batch is failed, pending otherwise)
  - _Requirements: 9.4_

- [ ] 15. Batch status page
  - Create `apps/web/src/app/payments/batch/[batchId]/page.tsx` (server component) and `BatchStatusClient.tsx` (client component)
  - Display: overall `Batch_Status` badge, `txHash`, `submittedAt`, `confirmedAt`, `totalAmount`, `currency`, payment count
  - When status is `submitted`, poll `GET /api/v1/payments/batch/:batchId` every 5 seconds using `useQuery` with `refetchInterval`
  - When status is `confirmed`, display a Stellar Explorer link (`https://stellar.expert/explorer/{network}/tx/{txHash}`) and a link to `/payments?batchId={batchId}`
  - When status is `failed`, display `failureReason` in a red alert box
  - Render `BatchStatusTable` below the summary
  - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6_

- [ ] 16. Add batch navigation link to payments page
  - Add a "Batch Payments" button to `apps/web/src/app/payments/PaymentsClient.tsx` that navigates to `/payments/batch`
  - _Requirements: 8.1_

- [ ] 17. Final checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP
- Each task references specific requirements for traceability
- Property tests use **fast-check** with a minimum of 100 iterations per property
- The stellar-service batch endpoint reuses the existing `requireSecret` middleware
- Balance checking calls the existing `stellarClient.getBalance` method; no new Horizon calls needed
