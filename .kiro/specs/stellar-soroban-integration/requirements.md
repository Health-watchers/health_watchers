# Requirements Document

## Introduction

This feature integrates Stellar's Soroban smart contract platform into the Health Watchers payment system. It enables programmable payment logic for clinics, including atomic payment splitting between multiple recipients (e.g., clinic and doctor), escrow-based subscription billing, and a frontend UI for configuring and confirming split payments. The integration extends the existing `stellar-service` microservice and the `payments` module in the API, and adds new configuration fields to clinic settings.

## Glossary

- **Soroban**: Stellar's smart contract platform, enabling programmable on-chain logic written in Rust and compiled to WebAssembly.
- **Payment_Splitter_Contract**: A Soroban smart contract that accepts a payment and atomically distributes it to multiple recipients according to configured percentage splits.
- **Subscription_Contract**: A Soroban smart contract that holds subscription payments in escrow and releases them monthly to the platform, with support for prorated cancellation refunds.
- **Split_Config**: A data structure defining one or more recipients and their corresponding percentage shares of a payment, where all percentages sum to exactly 100.
- **Contract_ID**: The unique on-chain identifier of a deployed Soroban contract on the Stellar network.
- **Soroban_RPC**: The JSON-RPC endpoint used to simulate and submit Soroban contract invocation transactions.
- **Stellar_Service**: The existing `apps/stellar-service` microservice responsible for all Stellar network interactions.
- **Payment_Intent**: An existing record in the Health Watchers system representing a pending payment, stored in the `PaymentRecord` collection.
- **Clinic_Admin**: A user with the `CLINIC_ADMIN` role who manages clinic-level settings and payment configuration.
- **XLM**: The native asset of the Stellar network, used as the payment currency in this integration.
- **Horizon**: The Stellar HTTP API used for account loading and transaction submission.
- **Testnet**: The Stellar test network used for development and staging deployments.

---

## Requirements

### Requirement 1: Payment Splitter Soroban Contract

**User Story:** As a clinic administrator, I want a Soroban smart contract that splits incoming payments between multiple recipients, so that funds are distributed atomically without manual intervention.

#### Acceptance Criteria

1. THE Payment_Splitter_Contract SHALL be written in Rust and compiled to WebAssembly for deployment on the Soroban platform.
2. WHEN the Payment_Splitter_Contract is invoked with a payment amount and a Split_Config, THE Payment_Splitter_Contract SHALL transfer the correct proportional amount to each recipient in a single atomic transaction.
3. IF the percentages in a Split_Config do not sum to exactly 100, THEN THE Payment_Splitter_Contract SHALL reject the invocation and return an error.
4. IF any recipient address in a Split_Config is invalid or does not exist on the Stellar network, THEN THE Payment_Splitter_Contract SHALL reject the invocation and return an error.
5. THE Payment_Splitter_Contract SHALL support a minimum of 2 and a maximum of 10 recipients per Split_Config.
6. WHEN the Payment_Splitter_Contract completes a split, THE Payment_Splitter_Contract SHALL emit a contract event containing the payment amount and the list of recipient addresses and amounts disbursed.

---

### Requirement 2: Contract Deployment and Storage

**User Story:** As a clinic administrator, I want the payment splitter contract deployed to the Stellar testnet and its ID stored in my clinic settings, so that the system can invoke it automatically when processing split payments.

#### Acceptance Criteria

1. WHEN the Payment_Splitter_Contract is deployed to the Stellar testnet, THE Stellar_Service SHALL store the resulting Contract_ID.
2. THE Clinic_Settings SHALL include an optional `sorobanContractId` field to store the Contract_ID associated with a clinic's payment splitter deployment.
3. WHEN a Clinic_Admin saves a Contract_ID to clinic settings, THE System SHALL validate that the Contract_ID is a non-empty string matching the Stellar contract address format (56-character alphanumeric starting with 'C').
4. IF a Clinic_Admin attempts to save an invalid Contract_ID, THEN THE System SHALL return a 400 error with a descriptive validation message.
5. THE Clinic_Settings SHALL include an optional `splitConfig` field storing the default Split_Config for the clinic, consisting of an array of recipient objects each with a `destination` (Stellar public key) and `percentage` (integer 1–99).

---

### Requirement 3: Payment Intent with Split Configuration

**User Story:** As a developer integrating payments, I want to create a payment intent that includes a split configuration, so that the system knows to invoke the Soroban contract instead of a direct transfer.

#### Acceptance Criteria

1. WHEN a payment intent is created with a `splitConfig` field, THE Payment_Intent SHALL store the split configuration alongside the existing payment record fields.
2. WHEN a payment intent is created with a `splitConfig`, THE System SHALL validate that the split percentages sum to exactly 100 before persisting the record.
3. IF a payment intent is created with a `splitConfig` whose percentages do not sum to 100, THEN THE System SHALL return a 400 error with a message indicating the invalid split configuration.
4. WHEN a payment intent includes a `splitConfig`, THE Payment_Intent SHALL record a `paymentType` field set to `'split'` to distinguish it from direct payments.
5. WHEN a payment intent includes a `splitConfig` but no `sorobanContractId` is provided, THE System SHALL attempt to resolve the Contract_ID from the clinic's stored `sorobanContractId` in clinic settings.
6. IF no Contract_ID can be resolved for a split payment intent, THEN THE System SHALL return a 400 error indicating that a Soroban contract ID is required for split payments.

---

### Requirement 4: Soroban Contract Invocation Transaction

**User Story:** As a developer, I want the stellar-service to build a valid Soroban contract invocation transaction for split payments, so that the contract is called correctly on-chain.

#### Acceptance Criteria

1. WHEN the Stellar_Service receives a request to invoke the Payment_Splitter_Contract, THE Stellar_Service SHALL build a Soroban contract invocation transaction using the `@stellar/stellar-sdk` `Contract` and `SorobanRpc` APIs.
2. WHEN building the invocation transaction, THE Stellar_Service SHALL pass the Split_Config recipients and percentages as Soroban contract arguments encoded as `xdr.ScVal` values.
3. WHEN building the invocation transaction, THE Stellar_Service SHALL simulate the transaction against the Soroban RPC endpoint before submission to validate it will succeed.
4. IF the Soroban RPC simulation returns an error, THEN THE Stellar_Service SHALL return the simulation error details to the caller without submitting the transaction.
5. WHEN the invocation transaction is successfully simulated, THE Stellar_Service SHALL assemble the final transaction with the simulation's resource fee and footprint, sign it, and submit it to the network.
6. THE Stellar_Service SHALL expose a new protected endpoint `POST /soroban/invoke` that accepts a contract ID, function name, arguments, and signing key reference, and returns the transaction hash on success.

---

### Requirement 5: Subscription Contract (Stub)

**User Story:** As a platform operator, I want a subscription Soroban contract stub deployed to testnet, so that the architecture for escrow-based subscription billing is established for future mainnet deployment.

#### Acceptance Criteria

1. THE Subscription_Contract SHALL be written in Rust as a stub implementation that defines the interface for holding subscription payments in escrow, releasing monthly to the platform, and processing prorated cancellation refunds.
2. WHEN the Subscription_Contract stub is deployed to the Stellar testnet, THE Stellar_Service SHALL store the resulting Contract_ID in configuration.
3. THE Subscription_Contract stub SHALL expose at minimum three callable functions: `deposit`, `release`, and `cancel_with_refund`, each accepting the appropriate arguments as defined in the contract interface.
4. THE Subscription_Contract stub SHALL return a `not_implemented` error for all function calls, clearly indicating it is a testnet stub pending mainnet deployment.

---

### Requirement 6: Split Configuration UI in Clinic Settings

**User Story:** As a clinic administrator, I want to configure payment split percentages in the clinic settings UI, so that I can define how payments are distributed between the clinic and doctors.

#### Acceptance Criteria

1. THE Clinic_Settings UI SHALL include a "Payment Splitting" section that allows a Clinic_Admin to add, edit, and remove split recipients.
2. WHEN a Clinic_Admin adds a recipient, THE UI SHALL require a valid Stellar public key (56-character string starting with 'G') and an integer percentage between 1 and 99.
3. WHEN the Clinic_Admin modifies split recipients, THE UI SHALL display a running total of all configured percentages and indicate visually whether the total equals 100.
4. IF the Clinic_Admin attempts to save a split configuration where the total percentage does not equal 100, THEN THE UI SHALL prevent form submission and display an error message.
5. THE Clinic_Settings UI SHALL include a field for the Soroban Contract_ID, with a placeholder and validation hint indicating the expected format.
6. WHEN the Clinic_Admin saves valid split configuration, THE UI SHALL call the `PUT /api/v1/settings` endpoint with the updated `splitConfig` and `sorobanContractId` fields.

---

### Requirement 7: Payment Confirmation Split Breakdown

**User Story:** As a clinic administrator, I want the payment confirmation screen to show how a split payment was distributed, so that I can verify the correct amounts were sent to each recipient.

#### Acceptance Criteria

1. WHEN a payment intent with `paymentType: 'split'` is displayed in the payment confirmation UI, THE UI SHALL show a split breakdown section listing each recipient's Stellar public key and the calculated amount they will receive.
2. WHEN displaying the split breakdown, THE UI SHALL calculate each recipient's amount as `(percentage / 100) * totalAmount` and display it formatted to 7 decimal places.
3. WHEN a split payment is confirmed with a transaction hash, THE UI SHALL display the Stellar Explorer link for the confirmed transaction alongside the split breakdown.
4. IF a payment intent does not have `paymentType: 'split'`, THEN THE UI SHALL display the standard single-recipient payment confirmation without a split breakdown section.

---

### Requirement 8: Testing with Mock Soroban RPC

**User Story:** As a developer, I want automated tests that verify contract invocation logic using a mock Soroban RPC, so that I can validate the integration without requiring a live testnet connection.

#### Acceptance Criteria

1. THE Test_Suite SHALL include unit tests for the Soroban invocation logic in the Stellar_Service that mock the Soroban RPC client.
2. WHEN the mock Soroban RPC returns a successful simulation response, THE Test_Suite SHALL verify that the Stellar_Service correctly assembles and signs the final transaction.
3. WHEN the mock Soroban RPC returns a simulation error, THE Test_Suite SHALL verify that the Stellar_Service returns the error without attempting to submit the transaction.
4. THE Test_Suite SHALL include property-based tests verifying that split percentage validation correctly rejects any Split_Config where the sum of percentages does not equal 100.
5. THE Test_Suite SHALL include property-based tests verifying that the amount calculation for each recipient in a split is correct: for any valid Split_Config and total amount, the sum of all calculated recipient amounts equals the total amount (within floating-point tolerance of 0.0000001 XLM).
