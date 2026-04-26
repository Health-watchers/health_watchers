# Implementation Plan: Stellar Soroban Integration

## Overview

Implement Soroban smart contract support for automated payment splitting in Health Watchers. Tasks proceed from contracts → stellar-service extension → API extension → frontend UI, with property-based tests placed close to each implementation step.

## Tasks

- [ ] 1. Set up Rust contracts workspace and implement Payment Splitter contract
  - Create `contracts/` directory at repo root with a Cargo workspace (`Cargo.toml`) containing two members: `payment_splitter` and `subscription_stub`
  - Implement `contracts/payment_splitter/src/lib.rs`: define `Recipient` struct (address + percentage), `split_payment` function that validates percentages sum to 100, executes one `token::transfer` per recipient, and emits a `split_complete` event
  - Add `soroban-sdk` and `soroban-sdk/testutils` as dependencies in `contracts/payment_splitter/Cargo.toml`
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6_

  - [ ]* 1.1 Write proptest property tests for payment_splitter contract
    - **Property 1: Split percentages must sum to exactly 100** — generate random Vec<u32> that don't sum to 100, assert `split_payment` returns `Err(Error::InvalidPercentages)`
    - **Property 2: Recipient amount calculation is correct and complete** — generate valid split configs and amounts, assert sum of disbursed amounts equals total within tolerance
    - **Property 3: Recipient count boundaries are enforced** — generate configs with <2 or >10 recipients, assert rejection
    - _Requirements: 1.2, 1.3, 1.5_

- [ ] 2. Implement Subscription Contract stub
  - Create `contracts/subscription_stub/src/lib.rs` with `deposit`, `release`, and `cancel_with_refund` functions that each return `Err(Error::NotImplemented)`
  - Add `soroban-sdk` dependency in `contracts/subscription_stub/Cargo.toml`
  - _Requirements: 5.1, 5.3, 5.4_

  - [ ]* 2.1 Write unit tests for subscription stub
    - Test that all three functions (`deposit`, `release`, `cancel_with_refund`) return `NotImplemented` error
    - _Requirements: 5.4_

- [ ] 3. Add shared SplitConfig types to packages/types
  - Create or extend `packages/types/src/index.ts` to export `SplitRecipient` and `SplitConfig` interfaces
  - Export `isValidContractId(id: string): boolean` — validates `/^C[A-Z2-7]{55}$/`
  - Export `isValidStellarPublicKey(key: string): boolean` — validates 56-char string starting with 'G'
  - Export `validateSplitConfig(config: SplitConfig): { valid: boolean; error?: string }` — checks recipient count (2–10) and percentage sum (100)
  - _Requirements: 1.3, 1.5, 2.3, 3.2_

  - [ ]* 3.1 Write property tests for shared validators
    - **Property 1: Split percentages must sum to exactly 100** — `fc.array(fc.integer({min:1,max:99}))` filtered to not sum to 100, assert `validateSplitConfig` returns invalid
    - **Property 3: Recipient count boundaries** — generate arrays of length <2 or >10, assert rejection
    - **Property 4: Contract ID format validation** — generate random strings, assert `isValidContractId` accepts only `/^C[A-Z2-7]{55}$/`
    - **Property 8: Stellar public key validation** — generate random strings, assert `isValidStellarPublicKey` accepts only 56-char strings starting with 'G'
    - Tag: `Feature: stellar-soroban-integration, Property 1/3/4/8`
    - _Requirements: 1.3, 1.5, 2.3, 6.2_

- [ ] 4. Implement Soroban invocation module in stellar-service
  - Create `apps/stellar-service/src/soroban.ts` with:
    - `simulateContract(req: InvokeContractRequest)` — loads source account, builds `Operation.invokeContractFunction`, calls `SorobanRpc.Server.simulateTransaction`
    - `invokeContract(req: InvokeContractRequest)` — calls `simulateContract`, assembles transaction with `SorobanRpc.assembleTransaction`, signs with service keypair, submits via `SorobanRpc.Server.sendTransaction`
    - `buildSplitArgs(amount: string, recipients: SplitRecipient[])` — encodes amount as `xdr.ScVal.scvI128` and recipients array as `xdr.ScVal.scvVec`
  - Add `sorobanRpcUrl` to `stellarConfig` (defaults to `https://soroban-testnet.stellar.org`)
  - _Requirements: 4.1, 4.2, 4.3, 4.5_

  - [ ]* 4.1 Write property tests for soroban.ts with mock SorobanRpc
    - **Property 6: Simulation is always called before submission** — mock `SorobanRpc.Server`, assert `simulateTransaction` is called before `sendTransaction` for any valid request
    - **Property 6 (error path):** mock simulation returning error, assert `sendTransaction` is never called
    - **Property 2: Amount calculation completeness** — generate random valid split configs, call `buildSplitArgs`, decode the ScVal and verify sum of amounts equals total
    - Tag: `Feature: stellar-soroban-integration, Property 6, Property 2`
    - _Requirements: 4.3, 4.4, 8.2, 8.3_

- [ ] 5. Add POST /soroban/invoke route to stellar-service
  - In `apps/stellar-service/src/index.ts`, add `POST /soroban/invoke` (protected by `requireSecret`)
  - Route accepts `{ contractId, functionName, amount, recipients }`, calls `invokeContract` from `soroban.ts`, returns `{ success, txHash, simulationFee }`
  - Add input validation: `contractId` must match `/^C[A-Z2-7]{55}$/`, `recipients` must be a non-empty array
  - Import and re-export `SorobanRpc` from `@stellar/stellar-sdk` (already a dependency)
  - _Requirements: 4.6_

- [ ] 6. Checkpoint — Ensure all stellar-service and contract tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 7. Extend PaymentRecord model and validation schema
  - In `apps/api/src/modules/payments/models/payment-record.model.ts`, add `splitConfig`, `paymentType` (`'direct' | 'split'`, default `'direct'`), and `sorobanContractId` fields
  - In `apps/api/src/modules/payments/payments.validation.ts`, extend `createPaymentIntentSchema` with optional `splitConfig` (array of recipients with `destination` and `percentage`) and optional `sorobanContractId`
  - _Requirements: 3.1, 3.4_

  - [ ]* 7.1 Write property test for split intent storage
    - **Property 5: Split payment intent stores config and sets paymentType** — generate random valid split configs, create payment intent, assert `paymentType === 'split'` and `splitConfig` matches input
    - Tag: `Feature: stellar-soroban-integration, Property 5`
    - _Requirements: 3.1, 3.4_

- [ ] 8. Extend payments controller with split payment logic
  - In `apps/api/src/modules/payments/payments.controller.ts`, extend the `POST /payments/intent` handler:
    1. If `splitConfig` present, call `validateSplitConfig` from `packages/types`; return 400 on failure
    2. Resolve `sorobanContractId` from request body or from `ClinicSettings`; return 400 if unresolvable
    3. Set `paymentType: 'split'` on the record
    4. After creating the `PaymentRecord`, call `stellarClient.invokeSorobanContract(...)` (new method)
    5. Store the returned `sorobanTxHash` on the record
  - Add `invokeSorobanContract` method to `apps/api/src/modules/payments/services/stellar-client.ts` that calls `POST /soroban/invoke`
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 4.1_

- [ ] 9. Extend ClinicSettings model and controller with Soroban fields
  - In `apps/api/src/modules/clinics/clinic-settings.model.ts`, add `sorobanContractId` (String, optional) and `splitConfig` (Mixed, optional) fields
  - In `apps/api/src/modules/clinics/clinic-settings.controller.ts`, extend the `PUT /api/v1/settings` handler to accept and persist `sorobanContractId` and `splitConfig`
  - Add server-side validation: if `sorobanContractId` is provided, it must match `/^C[A-Z2-7]{55}$/`; return 400 otherwise
  - _Requirements: 2.2, 2.3, 2.4, 2.5_

- [ ] 10. Checkpoint — Ensure all API tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 11. Implement SplitConfigSection component in clinic settings UI
  - Create `apps/web/src/components/settings/SplitConfigSection.tsx`:
    - Renders a list of recipient rows, each with a Stellar public key input and percentage input
    - "Add recipient" button appends a new empty row; "Remove" button removes a row
    - Displays a running total of percentages; shows red text and disables save when total ≠ 100
    - Validates public key format (56 chars, starts with 'G') on blur
    - Includes a `sorobanContractId` text input with placeholder `C...` and format hint
  - Integrate `SplitConfigSection` into `apps/web/src/app/settings/ClinicSettingsClient.tsx` as a new "Payment Splitting" section
  - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6_

  - [ ]* 11.1 Write property tests for SplitConfigSection
    - **Property 8: Stellar public key validation** — generate random strings, assert the validator accepts only 56-char strings starting with 'G'
    - **Property 1 (UI): Running total display** — generate random arrays of percentages, render component, assert displayed total equals sum of percentages
    - Tag: `Feature: stellar-soroban-integration, Property 8, Property 1`
    - _Requirements: 6.2, 6.3_

- [ ] 12. Implement SplitBreakdown component and extend payment confirmation UI
  - Create `apps/web/src/components/payments/SplitBreakdown.tsx`:
    - Accepts `splitConfig: SplitConfig`, `totalAmount: string`, and optional `txHash: string`
    - Renders a table of recipients with `destination` (truncated public key) and calculated amount `((percentage/100)*parseFloat(totalAmount)).toFixed(7)` XLM
    - When `txHash` is provided, renders a Stellar Explorer link: `https://stellar.expert/explorer/testnet/tx/{txHash}`
  - Extend `apps/web/src/components/payments/ConfirmPaymentModal.tsx` to render `SplitBreakdown` when `paymentType === 'split'`
  - _Requirements: 7.1, 7.2, 7.3, 7.4_

  - [ ]* 12.1 Write property tests for SplitBreakdown
    - **Property 7: Split breakdown display amounts are correct** — generate random valid split configs and amounts, render `SplitBreakdown`, assert each displayed amount equals `(percentage/100)*totalAmount` to 7 decimal places
    - **Property 2: Amount completeness** — assert sum of all displayed amounts equals `totalAmount` within tolerance 0.0000001
    - Tag: `Feature: stellar-soroban-integration, Property 7, Property 2`
    - _Requirements: 7.2_

- [ ] 13. Final checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP
- The Rust contracts require the `soroban-cli` tool for local build and deployment: `cargo install --locked soroban-cli`
- Contract deployment to testnet is a manual step: `soroban contract deploy --wasm target/wasm32-unknown-unknown/release/payment_splitter.wasm --network testnet`
- The resulting Contract_ID from deployment should be stored in `.env` as `SOROBAN_PAYMENT_SPLITTER_CONTRACT_ID`
- Property tests use `fast-check` (already available or add via `npm install --save-dev fast-check`)
- Rust property tests use `proptest` crate: add `proptest = "1"` to `[dev-dependencies]` in each contract's `Cargo.toml`
