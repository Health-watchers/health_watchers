# Payments Architecture

## Overview

This document describes how the payments module (`apps/api/src/modules/payments`) is structured: the service split with `apps/stellar-service`, the data model, the service layer, background jobs, and current route wiring.

**Related Issue**: #1285

## Table of Contents

- [Service Split: API vs. Stellar Service](#service-split-api-vs-stellar-service)
- [Data Model](#data-model)
- [Route Layer](#route-layer)
- [Service Layer](#service-layer)
- [Background Jobs](#background-jobs)
- [Payment Lifecycle](#payment-lifecycle)
- [Error Handling](#error-handling)
- [Known Gaps](#known-gaps)

## Service Split: API vs. Stellar Service

Payments span two processes:

- **`apps/api`** owns clinic-facing HTTP endpoints, request validation, persistence (`PaymentRecordModel` and related Mongo collections), and business rules (fee budgets, fraud checks, reconciliation).
- **`apps/stellar-service`** is a separate microservice that talks to the Stellar network directly (account funding, trustlines, path payments, fee bumps, multisig transaction building/signing/submission, batch payments, claimable balances, escrow). It also owns its own `payment-state-machine.js` (`PaymentState`, `PaymentStateContext`) for on-chain transaction state.

`apps/api` never calls Horizon directly — it goes through `services/stellar-client.ts`, a thin axios client that calls `apps/stellar-service` over HTTP. This keeps Stellar SDK/network concerns out of the main API process and lets the two scale independently.

## Data Model

`models/payment-record.model.ts` is the central collection. Beyond the original intent/status fields, it now carries:

- **Asset fields** — `assetCode`/`assetIssuer`, plus `sourceAssetCode`/`sourceAssetIssuer`/`destinationAmount`/`maxSourceAmount`/`path` for path payments.
- **Fee fields** — `feeStrategy` (`slow`/`standard`/`fast`), `sponsorFees`/`sponsoredFeeAmount`/`feeBumpHash` for fee-sponsored transactions.
- **Claimable balance fields** — `claimableBalanceId`, `claimableAfter`/`claimableUntil`, `claimed`/`claimedAt`.
- **Receipt fields** — `receiptNumber`/`receiptUrl`, `usdEquivalent`/`exchangeRate`.
- **Lifecycle fields** — `expiresAt`, `paymentType` (`immediate`/`multisig`/`escrow`), `idempotencyKey`.

Other models in the module: `payment-dispute.model.ts`, `batch-payment.model.ts`, `clinic-fee-budget.model.ts`, `compliance-report.model.ts`, `fraud-detection.model.ts`, `insurance-claim.model.ts`, `multisig-payment.model.ts`, `reimbursement.model.ts`, `xlm-rate.model.ts`, `balance-snapshot.model.ts`.

Indexes on `PaymentRecordModel` are query-driven rather than blanket: `{status, createdAt}` for job sweeps, `{clinicId, createdAt}` and `{clinicId, status}` for clinic-scoped listing/filtering, `{memo, clinicId}` and `{txHash}` (sparse) for lookups, and a TTL index scoped to `idempotencyKey` so idempotency records expire after 24h instead of growing unbounded.

## Route Layer

`payments.routes.ts` is the aggregator for the core payment surface, mounted at `/api/v1/payments`:

```typescript
router.use('/', exchangeRateRoutes);
router.use('/', paymentExportRoutes);
router.use('/', paymentRoutes);          // payments.controller.ts — intents, balance, fee-estimate, fund, trustline
router.use('/', disputeRoutes);
router.use('/claims', claimsRoutes);
router.use('/batch', batchPaymentRouter);
```

`reimbursement.controller.ts` is mounted separately, directly in `routes/v1/index.ts`.

## Service Layer

Rather than a single generic "payment provider" interface, business logic is split into focused, single-purpose services under `services/`:

| Service | Responsibility |
|---|---|
| `stellar-client.ts` | HTTP client to `apps/stellar-service` |
| `payment-confirmation.service.ts` | Confirms a payment given a submitted `txHash` |
| `payment-retry.service.ts` | Retries confirmation for payments with a `txHash` that failed to confirm |
| `fee-optimizer.service.ts` | Picks a fee strategy/amount given current network conditions |
| `fee-budget.service.ts` | Checks clinic fee-sponsorship budget before sponsoring a transaction |
| `sequence-cache.service.ts` | Caches Stellar account sequence numbers to avoid races on concurrent submissions |
| `xlm-rate.service.ts` | Fetches XLM→USD rate (CoinGecko, falling back to Stellar DEX) |
| `receipt.service.ts` / `receipt-pdf.service.ts` | Builds and renders payment receipts |
| `qr-code.service.ts` | Generates payment QR codes |
| `insurance-claims.service.ts` / `reimbursement.service.ts` | Insurance claim and reimbursement workflows |
| `compliance-reporting.service.ts` | Compliance report generation |
| `fraud-detection.service.ts` | Flags suspicious payment activity |
| `multisig-payment.service.ts` / `soroban-escrow.service.ts` | Multisig and escrow payment flows |
| `payment-split.service.ts` | Splits a payment across recipients |

`loan-state-machine.ts` defines the valid status transitions for loan-type records — the closest thing to a formal state machine on the `apps/api` side; on-chain transaction state is tracked by the state machine in `apps/stellar-service` instead.

## Background Jobs

Long-running/periodic work runs as jobs started from `app.ts`, not inline in request handlers:

- `services/reconciliation-job.ts` — checks stale pending payments against Horizon and updates their status.
- `services/payment-expiration-job.ts` — expires payments past their `expiresAt`.
- `services/balance-monitoring-job.ts` — monitors clinic Stellar balances.
- `services/claimable-expiry-notification-job.ts` — notifies before a claimable balance expires.
- `services/xlm-rate-job.ts` — refreshes the cached XLM/USD rate.

## Payment Lifecycle

1. Client requests an intent (`POST /payments/intent`) — validated via `payments.validation.ts` (amount format, asset, fee strategy, optional idempotency key).
2. `PaymentRecordModel` is created with `status: 'pending'`.
3. Client submits the transaction on-chain; `apps/stellar-service` builds/signs as needed (including multisig/fee-bump paths).
4. `payment-confirmation.service.ts` confirms the payment once a `txHash` is available; `reconciliation-job.ts` and `payment-retry.service.ts` catch payments that never confirm cleanly.
5. Receipts, exchange-rate snapshots, and compliance/fraud checks run off the confirmed record.

## Error Handling

Stellar/network failures from `stellar-client.ts` are surfaced as `502 StellarServiceError` rather than a generic `500`, so clients can distinguish "our bug" from "the Stellar network/service is unavailable." Request validation failures go through the shared `validateRequest` middleware and return a consistent `ValidationError` shape with per-field `details`.

## Known Gaps

- `recurring-payment.controller.ts`, `claimable-balance.controller.ts`, and `dex/dex-trade.controller.ts` exist in the module but are **not currently mounted** anywhere in `routes/v1` or `routes/v2` — their functionality isn't reachable over HTTP yet.
- `analytics.controller.ts` (payments-scoped analytics) is also unmounted; the `errorAnalyticsRouter` wired in `app.ts` is an unrelated monitoring-module controller with a similar name.
