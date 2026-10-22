---
title: Stellar Payments
description: "Blockchain payment processing on Stellar: payment intents and confirmation, balances, trustlines, path payments, QR codes and SEP-7 payment URIs, receipts, reconciliation, disputes and refunds, fraud review, compliance reports, multisig payments, batch and recurring payments, claimable balances, exchange rates, insurance claims and reimbursements, DEX trades, and payment analytics."
---

# Stellar Payments

Blockchain payment processing on Stellar: payment intents and confirmation, balances, trustlines, path payments, QR codes and SEP-7 payment URIs, receipts, reconciliation, disputes and refunds, fraud review, compliance reports, multisig payments, batch and recurring payments, claimable balances, exchange rates, insurance claims and reimbursements, DEX trades, and payment analytics.

| | |
|---|---|
| **Base path** | `/api/v1/payments` |
| **Source** | [`apps/api/src/modules/payments/exchange-rate.controller.ts`](https://github.com/Health-watchers/health_watchers/blob/main/apps/api/src/modules/payments/exchange-rate.controller.ts)<br/>[`apps/api/src/modules/payments/stellar-payments.export.controller.ts`](https://github.com/Health-watchers/health_watchers/blob/main/apps/api/src/modules/payments/stellar-payments.export.controller.ts)<br/>[`apps/api/src/modules/payments/stellar-payments.controller.ts`](https://github.com/Health-watchers/health_watchers/blob/main/apps/api/src/modules/payments/stellar-payments.controller.ts)<br/>[`apps/api/src/modules/payments/dispute.controller.ts`](https://github.com/Health-watchers/health_watchers/blob/main/apps/api/src/modules/payments/dispute.controller.ts)<br/>[`apps/api/src/modules/payments/claims.controller.ts`](https://github.com/Health-watchers/health_watchers/blob/main/apps/api/src/modules/payments/claims.controller.ts)<br/>[`apps/api/src/modules/payments/batch-payment.controller.ts`](https://github.com/Health-watchers/health_watchers/blob/main/apps/api/src/modules/payments/batch-payment.controller.ts)<br/>[`apps/api/src/modules/payments/recurring-payment.controller.ts`](https://github.com/Health-watchers/health_watchers/blob/main/apps/api/src/modules/payments/recurring-payment.controller.ts)<br/>[`apps/api/src/modules/payments/analytics.controller.ts`](https://github.com/Health-watchers/health_watchers/blob/main/apps/api/src/modules/payments/analytics.controller.ts)<br/>[`apps/api/src/modules/payments/reimbursement.controller.ts`](https://github.com/Health-watchers/health_watchers/blob/main/apps/api/src/modules/payments/reimbursement.controller.ts)<br/>[`apps/api/src/modules/payments/dex/dex-trade.routes.ts`](https://github.com/Health-watchers/health_watchers/blob/main/apps/api/src/modules/payments/dex/dex-trade.routes.ts) |

## Data model

- PaymentRecord: payment intents and their on-chain status
- PaymentDispute, FraudAlert, ComplianceReport, MultisigPayment, BatchPayment, RecurringPayment
- BalanceSnapshot, ClinicFeeBudget, XLMRate
- InsuranceClaim, Reimbursement

## Key endpoints

| Method | Path | Roles |
|--------|------|-------|
| `GET` | `/api/v1/payments/exchange-rate` | Authenticated |
| `GET` | `/api/v1/payments/export` | Authenticated |
| `GET` | `/api/v1/payments/fee-estimate` | Authenticated |
| `GET` | `/api/v1/payments/balance` | Authenticated |
| `POST` | `/api/v1/payments/fund` | Authenticated |
| `POST` | `/api/v1/payments/trustline` | Authenticated |
| `GET` | `/api/v1/payments` | Authenticated |
| `GET` | `/api/v1/payments/paths` | Authenticated |
| `GET` | `/api/v1/payments/stellar/orderbook` | Authenticated |
| `POST` | `/api/v1/payments/intent` | Authenticated |
| `PATCH` | `/api/v1/payments/:intentId/confirm` | Authenticated |
| `POST` | `/api/v1/payments/sync` | Authenticated |
| `GET` | `/api/v1/payments/reconciliation` | Authenticated |
| `GET` | `/api/v1/payments/by-memo/:memo` | Authenticated |
| `GET` | `/api/v1/payments/balance-snapshots` | Authenticated |
| `GET` | `/api/v1/payments/analytics` | Authenticated |
| `GET` | `/api/v1/payments/revenue-dashboard` | Authenticated |
| `GET` | `/api/v1/payments/:intentId/qr` | Authenticated |
| `GET` | `/api/v1/payments/:intentId/payment-uri` | Authenticated |
| `GET` | `/api/v1/payments/:intentId/receipt` | Authenticated |
| `GET` | `/api/v1/payments/:intentId/receipt/url` | Authenticated |
| `GET` | `/api/v1/payments/fraud-review` | `CLINIC_ADMIN` |
| `POST` | `/api/v1/payments/fraud-review/:alertId/approve` | `CLINIC_ADMIN` |
| `POST` | `/api/v1/payments/fraud-review/:alertId/reject` | `CLINIC_ADMIN` |
| `GET` | `/api/v1/payments/compliance/report` | `CLINIC_ADMIN` |
| `POST` | `/api/v1/payments/compliance/report/generate` | `CLINIC_ADMIN` |
| `POST` | `/api/v1/payments/compliance/report/:reportId/submit` | `CLINIC_ADMIN` |
| `GET` | `/api/v1/payments/compliance/reports` | `CLINIC_ADMIN` |
| `POST` | `/api/v1/payments/multisig` | Authenticated |
| `POST` | `/api/v1/payments/multisig/:paymentId/sign` | Authenticated |
| `GET` | `/api/v1/payments/multisig/:paymentId` | Authenticated |
| `GET` | `/api/v1/payments/multisig/pending/:signer` | Authenticated |
| `GET` | `/api/v1/payments/expiring-claimable` | `CLINIC_ADMIN`, `SUPER_ADMIN` |
| `POST` | `/api/v1/payments/:intentId/dispute` | Authenticated |
| `GET` | `/api/v1/payments/disputes` | `CLINIC_ADMIN`, `SUPER_ADMIN` |
| `POST` | `/api/v1/payments/:intentId/disputes/:disputeId/evidence` | Authenticated |
| `POST` | `/api/v1/payments/disputes/:disputeId/evidence` | Authenticated |
| `PUT` | `/api/v1/payments/disputes/:id/resolve` | `CLINIC_ADMIN`, `SUPER_ADMIN` |
| `POST` | `/api/v1/payments/disputes/:id/refund` | `CLINIC_ADMIN`, `SUPER_ADMIN` |
| `POST` | `/api/v1/payments/claims/submit` | `DOCTOR`, `CLINIC_ADMIN`, `SUPER_ADMIN` |
| `POST` | `/api/v1/payments/claims/verify` | `DOCTOR`, `CLINIC_ADMIN`, `SUPER_ADMIN` |
| `GET` | `/api/v1/payments/claims/history` | `DOCTOR`, `CLINIC_ADMIN`, `SUPER_ADMIN` |
| `GET` | `/api/v1/payments/claims/:claimId` | `DOCTOR`, `CLINIC_ADMIN`, `SUPER_ADMIN` |
| `POST` | `/api/v1/payments/batch` | `CLINIC_ADMIN`, `SUPER_ADMIN` |
| `GET` | `/api/v1/payments/batch/:batchId` | `CLINIC_ADMIN`, `SUPER_ADMIN` |
| `POST` | `/api/v1/payments/recurring` | `CLINIC_ADMIN` |
| `GET` | `/api/v1/payments/recurring` | Authenticated |
| `PUT` | `/api/v1/payments/recurring/:id/pause` | `CLINIC_ADMIN` |
| `PUT` | `/api/v1/payments/recurring/:id/resume` | `CLINIC_ADMIN` |
| `DELETE` | `/api/v1/payments/recurring/:id` | `CLINIC_ADMIN` |
| `PUT` | `/api/v1/payments/recurring/:id` | `CLINIC_ADMIN` |
| `GET` | `/api/v1/payments/analytics/export` | `SUPER_ADMIN`, `CLINIC_ADMIN`, `DOCTOR`, `NURSE`, `ASSISTANT`, `READ_ONLY` |
| `POST` | `/api/v1/payments/insurance-reimbursement` | Public |
| `GET` | `/api/v1/payments/reimbursements` | `CLINIC_ADMIN`, `SUPER_ADMIN` |
| `GET` | `/api/v1/payments/reimbursements/:claimId` | Authenticated |
| `POST` | `/api/v1/payments/dex/trade` | `CLINIC_ADMIN` |
| `GET` | `/api/v1/payments/dex/history` | `CLINIC_ADMIN`, `DOCTOR` |

## Roles

Roles referenced by this module: `ASSISTANT`, `CLINIC_ADMIN`, `DOCTOR`, `NURSE`, `READ_ONLY`, `SUPER_ADMIN`.

- **Authenticated** means any signed-in user. Handlers still scope data to the caller's clinic (and to the caller's own records for `PATIENT` users).
- **Public** means the route has no session guard. It is either intentionally public or authenticated by other means, such as a signature, token, or API key.

:::note

Payment routes use the `paymentLimiter` rate limiter. The Stellar keypairs themselves are held by `apps/stellar-service`.

:::

## Related

- [Stellar Integration](/stellar/overview)
- [Setting up the Stellar wallet (user guide)](/user-guide/stellar-wallet-and-payments)
- [Invoices](/payments/invoices)
