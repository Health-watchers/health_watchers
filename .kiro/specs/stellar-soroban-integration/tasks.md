# Implementation Plan: Stellar Soroban Integration

## Overview

Implement Soroban smart contract support for automated payment splitting in Health Watchers. Tasks proceed from contracts → stellar-service extension → API extension → frontend UI, with property-based tests placed close to each implementation step.

## Tasks

- [x] 1. Scaffold Soroban contract project under `apps/stellar-service/src/soroban/` and implement the Payment Escrow contract
  - Created `apps/stellar-service/src/soroban/` containing the Rust contract crate (`Cargo.toml`, `src/lib.rs`) plus `scripts/build.sh` and `scripts/deploy.sh`
  - Implemented the escrow contract in `apps/stellar-service/src/soroban/src/lib.rs`:
    - `deposit(depositor, token, amount, recipients)` — validates recipient count (2–10) and percentages summing to 100, pulls `amount` from `depositor` via `token::transfer`, stores the escrow entry, emits a `deposit` event
    - `release(escrow_id)` — executes one `token::transfer` per recipient according to the stored split, marks the escrow released, emits a `release` event
    - `refund(escrow_id)` — returns the full escrowed amount to the depositor, marks the escrow refunded, emits a `refund` event
    - `get_escrow(escrow_id)` — read-only accessor for escrow state
    - `Recipient` struct (address + percentage) and `Error` enum (`InvalidPercentages`, `InvalidRecipientCount`, `EscrowNotFound`, `AlreadySettled`, `NotImplemented`)
  - Added `soroban-sdk` and `soroban-sdk/testutils` (dev) dependencies in the contract `Cargo.toml`
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6_
  - **Deviation:** the original design specified a standalone `payment_splitter` contract in a repo-root `contracts/` workspace. The implementation instead prioritizes an escrow contract (deposit → release/refund) living under `apps/stellar-service/src/soroban/`, so funds are held until release rather than split immediately. The `payment_splitter` and `subscription_stub` crates were not created; the escrow contract supersedes them for the current payment flow.

  - [ ]* 1.1 Write proptest property tests for payment_splitter contract
    - **Property 1: Split percentages must sum to exactly 100** — generate random Vec<u32> that don't sum to 100, assert `split_payment` returns `Err(Error::InvalidPercentages)`
    - **Property 2: Recipient amount calculation is correct and complete** — generate valid split configs and amounts, assert sum of disbursed amounts equals total within tolerance
    - **Property 3: Recipient count boundaries are enforced** — generate configs with <2 or >10 recipients, assert rejection
    - _Requirements: 1.2, 1.3, 1.5_

- [ ] 2. Implement Subscription Contract stub
  - Create `contracts/subscription_stub/src/lib.rs` with `deposit`, `release`, and `cancel_with_refund` functions that each return `Err(Error::NotImplemented)`
  - Add `soroban-sdk` dependency in `contracts/subscription_stub/Cargo.toml`
  - _Requirements: 5.1, 5.3, 5.4_
  - **Status:** Not started. The escrow contract's `deposit`/`release`/`refund` functions cover the near-term subscription flow; a dedicated stub crate can be added later if needed.

  - [ ]* 2.1 Write unit tests for subscription stub
    - Test that all three functions (`deposit`, `release`, and `cancel_with_refund`) return `NotImplemented` error
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

- [x] 4. Implement Soroban invocation module in stellar-service
  - Created `apps/stellar-service/src/soroban.ts` with:
    - `simulateContract(req: InvokeContractRequest)` — loads source account, builds `Operation.invokeContractFunction`, calls `SorobanRpc.Server.simulateTransaction`
    - `invokeContract(req: InvokeContractRequest)` — calls `simulateContract`, assembles transaction with `SorobanRpc.assembleTransaction`, signs with service keypair, submits via `SorobanRpc.Server.sendTransaction`
    - `buildSplitArgs(amount: string, recipients: SplitRecipient[])` — encodes amount as `xdr.ScVal.scvI128` and recipients array as `xdr.ScVal.scvVec`
    - Escrow helpers: `buildDepositArgs(...)`, `buildReleaseArgs(escrowId)`, `buildRefundArgs(escrowId)` for invoking the escrow contract functions
  - Added `sorobanRpcUrl` to `stellarConfig` (defaults to `https://soroban-testnet.stellar.org`)
  - _Requirements: 4.1, 4.2, 4.3, 4.5_

  - [ ]* 4.1 Write property tests for soroban.ts with mock SorobanRpc
    - **Property 6: Simulation is always called before submission** — mock `SorobanRpc.Server`, assert `simulateTransaction` is called before `sendTransaction` for any valid request
    - **Property 6 (error path):** mock simulation returning error, assert `sendTransaction` is never called
    - **Property 2: Amount calculation completeness** — generate random valid split configs, call `buildSplitArgs`, decode the ScVal and verify sum of amounts equals total
    - Tag: `Feature: stellar-soroban-integration, Property 6, Property 2`
    - _Requirements: 4.3, 4.4, 8.2, 8.3_

- [x] 5. Add Soroban routes to stellar-service
  - In `apps/stellar-service/src/index.ts`, added `POST /soroban/invoke` (protected by `requireSecret`)
    - Accepts `{ contractId, functionName, amount, recipients }`, calls `invokeContract` from `soroban.ts`, returns `{ success, txHash, simulationFee }`
    - Input validation: `contractId` must match `/^C[A-Z2-7]{55}$/`, `recipients` must be a non-empty array
  - Added escrow routes (all protected by `requireSecret`):
    - `POST /soroban/escrow/deposit` — accepts `{ contractId, depositor, token, amount, recipients }`, invokes the escrow `deposit` function, returns `{ success, txHash, escrowId, simulationFee }`
    - `POST /soroban/escrow/release` — accepts `{ contractId, escrowId }`, invokes `release`, returns `{ success, txHash, simulationFee }`
    - `POST /soroban/escrow/refund` — accepts `{ contractId, escrowId }`, invokes `refund`, returns `{ success, txHash, simulationFee }`
  - Imported and re-exported `SorobanRpc` from `@stellar/stellar-sdk` (already a dependency)
  - _Requirements: 4.6_

- [x] 6. Checkpoint — Ensure all stellar-service and contract tests pass
  - Contract unit tests added in `apps/stellar-service/src/soroban/src/lib.rs` using `soroban-sdk/testutils` (deposit/release/refund happy paths, invalid percentages, invalid recipient count, double-settle rejection)
  - stellar-service tests cover `soroban.ts` invocation and the new routes

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

- [x] 14. Add contract build/deploy scripts and README documentation
  - `apps/stellar-service/src/soroban/scripts/build.sh` — builds the contract to `target/wasm32-unknown-unknown/release/` via `soroban contract build` (falls back to `cargo build --target wasm32-unknown-unknown --release`)
  - `apps/stellar-service/src/soroban/scripts/deploy.sh` — deploys the built WASM to the configured network via `soroban contract deploy` and prints the resulting Contract_ID
  - Updated `apps/stellar-service/README.md` with a "Soroban Contracts" section covering prerequisites, build, deploy, env configuration (`SOROBAN_RPC_URL`, `SOROBAN_ESCROW_CONTRACT_ID`), contract functions/events, and the `/soroban/*` endpoints
  - _Requirements: 4.1, 4.5_

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP
- The Rust contract requires the `soroban-cli` tool for local build and deployment: `cargo install --locked soroban-cli`
- Build the contract with `apps/stellar-service/src/soroban/scripts/build.sh`; deploy to testnet with `apps/stellar-service/src/soroban/scripts/deploy.sh` (equivalent to `soroban contract deploy --wasm target/wasm32-unknown-unknown/release/<contract>.wasm --network testnet`)
- The resulting Contract_ID from deployment should be stored in `.env` as `SOROBAN_ESCROW_CONTRACT_ID` (the original design named this `SOROBAN_PAYMENT_SPLITTER_CONTRACT_ID`; the escrow contract supersedes the splitter)
- Property tests use `fast-check` (already available or add via `npm install --save-dev fast-check`)
- Rust property tests use `proptest` crate: add `proptest = "1"` to `[dev-dependencies]` in the contract's `Cargo.toml`

## Deviations from Original Design

- **Escrow over splitter:** the implemented contract is a payment escrow (`deposit`/`release`/`refund`) rather than an immediate `payment_splitter`. Funds are held in escrow and disbursed on `release`, or returned on `refund`.
- **Location:** the contract lives under `apps/stellar-service/src/soroban/` instead of a repo-root `contracts/` Cargo workspace.
- **Subscription stub:** not implemented; the escrow contract covers the current subscription payment flow.
- **Events:** the contract emits `deposit`, `release`, and `refund` events (instead of the originally specified `split_complete`).
- **Env var:** `SOROBAN_ESCROW_CONTRACT_ID` replaces `SOROBAN_PAYMENT_SPLITTER_CONTRACT_ID`.
