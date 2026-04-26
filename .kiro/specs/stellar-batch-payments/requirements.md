# Requirements Document

## Introduction

This feature adds batch payment processing to the Health Watchers platform, allowing clinics to submit multiple Stellar payment operations in a single atomic transaction. Clinics can pay multiple doctors their monthly fees or process multiple patient refunds in one submission. The batch is built as a single Stellar transaction with up to 100 payment operations, meaning all payments succeed or all fail together. The feature includes a REST API for batch submission and status tracking, a `BatchPayment` model in MongoDB, and a frontend UI with CSV upload, batch preview, and a status tracking page.

## Glossary

- **Batch_Payment**: A single Stellar transaction containing multiple payment operations, represented in the database by a `BatchPayment` document.
- **Payment_Instruction**: A single payment within a batch, consisting of a destination Stellar public key, an amount, and an optional memo.
- **Batch_ID**: A UUID that uniquely identifies a `BatchPayment` record.
- **Stellar_Service**: The existing `apps/stellar-service` microservice responsible for all Stellar network interactions.
- **API**: The existing `apps/api` Express application that exposes REST endpoints.
- **Clinic_Admin**: A user with the `CLINIC_ADMIN` role who initiates and monitors batch payments.
- **Payment_Record**: The existing MongoDB model (`PaymentRecord`) representing a single confirmed payment.
- **Horizon**: The Stellar HTTP API used for account loading and transaction submission.
- **XLM**: The native asset of the Stellar network.
- **USDC**: The USD Coin stablecoin asset on the Stellar network.
- **Atomic_Transaction**: A Stellar transaction where all operations succeed or all fail; there is no partial execution.
- **CSV**: A comma-separated values file used to upload batch payment instructions in bulk.
- **Batch_Status**: The lifecycle state of a `BatchPayment`: `pending`, `submitted`, `confirmed`, or `failed`.

---

## Requirements

### Requirement 1: Batch Payment API Endpoint

**User Story:** As a clinic administrator, I want to submit multiple payment instructions in a single API call, so that I can efficiently pay multiple recipients without making individual requests.

#### Acceptance Criteria

1. THE API SHALL expose a `POST /api/v1/payments/batch` endpoint that accepts an array of `Payment_Instruction` objects and a `currency` field.
2. WHEN a valid batch request is received, THE API SHALL create a `Batch_Payment` record with status `pending` and return it with HTTP 201.
3. THE API SHALL enforce a maximum of 100 `Payment_Instruction` objects per batch request.
4. IF a batch request contains more than 100 `Payment_Instruction` objects, THEN THE API SHALL return a 400 error with a message indicating the limit.
5. IF a batch request contains zero `Payment_Instruction` objects, THEN THE API SHALL return a 400 error with a message indicating that at least one payment is required.
6. THE `POST /api/v1/payments/batch` endpoint SHALL require authentication and restrict access to users with the `CLINIC_ADMIN` or `SUPER_ADMIN` role.
7. IF a user without `CLINIC_ADMIN` or `SUPER_ADMIN` role calls `POST /api/v1/payments/batch`, THEN THE API SHALL return a 403 error.

---

### Requirement 2: Batch Payment Validation

**User Story:** As a clinic administrator, I want the system to validate all payment instructions before building the Stellar transaction, so that I receive clear errors before any funds are moved.

#### Acceptance Criteria

1. WHEN a batch request is received, THE API SHALL validate that every `Payment_Instruction` destination is a valid Stellar public key (56-character string starting with `G`).
2. WHEN a batch request is received, THE API SHALL validate that every `Payment_Instruction` amount is a positive numeric string with at most 7 decimal places.
3. WHEN a batch request is received, THE API SHALL validate that every `Payment_Instruction` memo, if provided, does not exceed 28 bytes when encoded as UTF-8.
4. WHEN a batch request is received, THE API SHALL check that the sum of all `Payment_Instruction` amounts does not exceed the clinic's available balance for the specified currency.
5. WHEN a batch request is received, THE API SHALL check for duplicate destination addresses within the same batch and reject the request if any duplicates are found.
6. IF any validation check fails, THEN THE API SHALL return a 400 error with a structured response identifying which `Payment_Instruction` indices failed and the reason for each failure.
7. THE API SHALL perform all validation checks before creating any database records or submitting any transactions.

---

### Requirement 3: Stellar Transaction Construction

**User Story:** As a developer, I want the stellar-service to build a single Stellar transaction containing all payment operations, so that the batch executes atomically on-chain.

#### Acceptance Criteria

1. WHEN a validated batch is ready for submission, THE Stellar_Service SHALL build a single `TransactionBuilder` instance and add one `Operation.payment` per `Payment_Instruction`.
2. THE Stellar_Service SHALL expose a new protected endpoint `POST /batch` that accepts an array of payment operations and the source account public key, and returns the transaction hash on success.
3. WHEN building the batch transaction, THE Stellar_Service SHALL load the source account sequence number from Horizon exactly once before adding operations.
4. WHEN the batch transaction is submitted, THE Stellar_Service SHALL submit it as a single atomic transaction to Horizon.
5. IF the Horizon submission returns an error, THEN THE Stellar_Service SHALL return the full Horizon error details to the caller.
6. WHEN the batch transaction is successfully submitted, THE Stellar_Service SHALL return the transaction hash and the submission timestamp.
7. THE Stellar_Service SHALL enforce that the number of operations in a batch transaction does not exceed 100.

---

### Requirement 4: BatchPayment Model

**User Story:** As a developer, I want a `BatchPayment` MongoDB model that tracks the full lifecycle of a batch, so that the system can report status and link individual payment records after confirmation.

#### Acceptance Criteria

1. THE System SHALL define a `BatchPayment` MongoDB schema with the following required fields: `batchId` (UUID string, unique), `clinicId` (string), `createdBy` (string, user ID), `payments` (array of `Payment_Instruction`), `status` (`pending` | `submitted` | `confirmed` | `failed`), `currency` (string), and `totalAmount` (string).
2. THE `BatchPayment` schema SHALL include the following optional fields: `txHash` (string), `submittedAt` (Date), `confirmedAt` (Date), and `failureReason` (string).
3. WHEN a `BatchPayment` is created, THE System SHALL set `status` to `pending` and compute `totalAmount` as the sum of all `Payment_Instruction` amounts.
4. WHEN a batch transaction is successfully submitted to Horizon, THE System SHALL update the `BatchPayment` status to `submitted` and record `txHash` and `submittedAt`.
5. WHEN a batch transaction is confirmed on-chain, THE System SHALL update the `BatchPayment` status to `confirmed` and record `confirmedAt`.
6. IF a batch transaction fails at any stage, THE System SHALL update the `BatchPayment` status to `failed` and record the `failureReason`.
7. THE `BatchPayment` schema SHALL index the `clinicId`, `status`, and `batchId` fields for efficient querying.

---

### Requirement 5: Individual PaymentRecord Creation

**User Story:** As a clinic administrator, I want each payment in a confirmed batch to have its own `PaymentRecord`, so that individual payments appear in the standard payment history and can be reconciled.

#### Acceptance Criteria

1. WHEN a `BatchPayment` transitions to `confirmed` status, THE System SHALL create one `PaymentRecord` document per `Payment_Instruction` in the batch.
2. WHEN creating `PaymentRecord` documents from a confirmed batch, THE System SHALL set each record's `status` to `confirmed`, `txHash` to the batch transaction hash, `confirmedAt` to the batch confirmation time, and `clinicId` to the batch's `clinicId`.
3. WHEN creating `PaymentRecord` documents from a confirmed batch, THE System SHALL set a `batchId` reference field on each record linking it to the parent `BatchPayment`.
4. THE System SHALL create all `PaymentRecord` documents for a confirmed batch in a single database operation to maintain consistency.
5. IF `PaymentRecord` creation fails after a batch is confirmed, THE System SHALL log the error and retain the `BatchPayment` in `confirmed` status so that record creation can be retried.

---

### Requirement 6: Batch Status Tracking API

**User Story:** As a clinic administrator, I want to query the status of a batch payment, so that I can monitor progress and see which individual payments succeeded.

#### Acceptance Criteria

1. THE API SHALL expose a `GET /api/v1/payments/batch/:batchId` endpoint that returns the `BatchPayment` document and the status of each `Payment_Instruction`.
2. WHEN a `GET /api/v1/payments/batch/:batchId` request is received, THE API SHALL scope the lookup to the authenticated user's `clinicId` to prevent cross-clinic data access.
3. IF the requested `batchId` does not exist or belongs to a different clinic, THEN THE API SHALL return a 404 error.
4. THE API SHALL expose a `GET /api/v1/payments/batch` endpoint that returns a paginated list of `BatchPayment` records for the authenticated clinic, ordered by `createdAt` descending.
5. THE `GET /api/v1/payments/batch` endpoint SHALL support `status` and `page`/`limit` query parameters for filtering and pagination.
6. THE `GET /api/v1/payments/batch/:batchId` and `GET /api/v1/payments/batch` endpoints SHALL require authentication and be accessible to users with roles `CLINIC_ADMIN`, `SUPER_ADMIN`, `DOCTOR`, `NURSE`, `ASSISTANT`, or `READ_ONLY`.

---

### Requirement 7: CSV Upload for Batch Payment Instructions

**User Story:** As a clinic administrator, I want to upload a CSV file containing payment instructions, so that I can prepare large batches without manually entering each payment.

#### Acceptance Criteria

1. THE Web UI SHALL provide a CSV upload interface on the batch payment page that accepts files with the columns `destination`, `amount`, and `memo` (memo optional).
2. WHEN a CSV file is uploaded, THE Web UI SHALL parse the file client-side and display a preview table of the parsed `Payment_Instruction` objects before submission.
3. WHEN parsing a CSV file, THE Web UI SHALL validate each row and display inline errors for rows with invalid destination addresses, invalid amounts, or memos exceeding 28 bytes.
4. IF the parsed CSV contains more than 100 rows, THEN THE Web UI SHALL display an error indicating the 100-payment limit and prevent submission.
5. THE Web UI SHALL provide a downloadable CSV template with the correct column headers and one example row.

---

### Requirement 8: Batch Preview and Submission UI

**User Story:** As a clinic administrator, I want to review the full batch before submitting it, so that I can verify all payment details and the total amount before funds are moved.

#### Acceptance Criteria

1. WHEN payment instructions are ready (from CSV upload or manual entry), THE Web UI SHALL display a batch preview showing each `Payment_Instruction` with its destination, amount, and memo.
2. WHEN displaying the batch preview, THE Web UI SHALL show the total number of payments and the total amount in the selected currency.
3. WHEN displaying the batch preview, THE Web UI SHALL show the clinic's current available balance and indicate whether the balance is sufficient for the batch.
4. WHEN the Clinic_Admin confirms the batch preview, THE Web UI SHALL call `POST /api/v1/payments/batch` and display a loading state during submission.
5. WHEN the batch is successfully submitted, THE Web UI SHALL navigate to the batch status page for the newly created batch.
6. IF the batch submission fails, THE Web UI SHALL display the error message returned by the API without navigating away from the preview page.

---

### Requirement 9: Batch Status Page

**User Story:** As a clinic administrator, I want a dedicated page showing the status of a batch payment and each individual payment within it, so that I can track progress after submission.

#### Acceptance Criteria

1. THE Web UI SHALL provide a batch status page at `/payments/batch/:batchId` that displays the overall `Batch_Status`, `txHash`, `submittedAt`, `confirmedAt`, and `totalAmount`.
2. WHEN the `Batch_Status` is `submitted`, THE Web UI SHALL poll `GET /api/v1/payments/batch/:batchId` every 5 seconds and update the display automatically.
3. WHEN the `Batch_Status` is `confirmed`, THE Web UI SHALL display a link to the Stellar Explorer for the `txHash`.
4. THE batch status page SHALL display a table of all `Payment_Instruction` objects in the batch, showing destination, amount, memo, and individual status derived from the batch status.
5. WHEN the `Batch_Status` is `confirmed`, THE Web UI SHALL display a link to the standard payments list filtered by the `batchId`.
6. WHEN the `Batch_Status` is `failed`, THE Web UI SHALL display the `failureReason` prominently.
