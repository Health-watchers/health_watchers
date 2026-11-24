---
id: payment-lifecycle
title: Payment Lifecycle Diagrams
sidebar_label: Payment Lifecycle
description: Sequence diagrams for every Stellar payment flow across web, API, stellar-service, Horizon, jobs and webhooks.
---

# Payment Lifecycle Diagrams

These diagrams follow a Stellar payment across the web app, the API
(`apps/api`), `stellar-service` (`apps/stellar-service`), Horizon, the background
jobs and outbound webhooks.

**Participants used throughout**

| Name           | What it is                                                                                       |
| -------------- | ------------------------------------------------------------------------------------------------ |
| Web            | Next.js app (`apps/web`) or the patient portal                                                   |
| Wallet         | The patient's Stellar wallet (Freighter, Lobstr, …) that signs and submits transactions        |
| API            | Express API (`apps/api`)                                                                         |
| DB             | MongoDB (`PaymentRecord`, `PreAuth`, `MultiSigPayment`, `PaymentDispute`, `RecurringPayment`, …) |
| Outbox         | Transactional outbox + relay (`modules/outbox`, #1432)                                           |
| SS             | `stellar-service`, the only component holding the platform signing key                          |
| Horizon        | Stellar Horizon API                                                                              |
| Jobs           | BullMQ scheduled jobs; see `docs/BACKGROUND_JOBS.md` in the repository                           |
| Consumer       | Third-party webhook endpoint; see `docs/WEBHOOK_CONSUMER_GUIDE.md` in the repository             |

---

## State model

`apps/stellar-service/src/payment-state-machine.ts` defines the canonical lifecycle:

```mermaid
stateDiagram-v2
    [*] --> PENDING: createPayment()
    PENDING --> SUBMITTED: tx submitted to Horizon<br/>(guard: from/to keys set, amount > 0)
    PENDING --> FAILED: expired / rejected before submission
    SUBMITTED --> CONFIRMED: included in a ledger<br/>(guard: transactionHash set)
    SUBMITTED --> FAILED: rejected / timed out
    SUBMITTED --> ROLLED_BACK: rollback(reason)
    FAILED --> ROLLED_BACK: rollback(reason)
    CONFIRMED --> [*]
    FAILED --> [*]
    ROLLED_BACK --> [*]
```

`CONFIRMED`, `FAILED` and `ROLLED_BACK` are terminal. A rollback always needs a reason.

### Mapping to persisted state

The API stores a coarser `PaymentRecord.status`. The table maps each
state-machine state to what is stored and what causes the transition.

| State machine | `PaymentRecord.status` | Set by                                                                                                                                     |
| ------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `PENDING`     | `pending`              | `POST /payments/intent`, claimable balance creation                                                                                         |
| `SUBMITTED`   | `pending` (+ `txHash` once known) | Not stored separately: the wallet submits to Horizon, and the API only learns the hash on confirm or from the payment stream       |
| `CONFIRMED`   | `confirmed`            | `confirmPayment()` (via `PATCH /payments/:intentId/confirm` or `POST /webhooks/stellar`), `reconciliation` job, `POST /payments/sync`, claimable claim |
| `FAILED`      | `failed`               | Validation mismatch on confirm, `payment-expiration` job, `reconciliation` job, claimable reclaim                                          |
| `ROLLED_BACK` | no direct equivalent   | A refund creates a **new** `confirmed` `PaymentRecord` for the refund; the original stays `confirmed` and the dispute records the outcome |

Escrow and multisig flows also use the side fields `paymentType`, `escrowStatus`
and `MultiSigPayment.status`, shown in their diagrams.

---

## Payment intent → confirmation

The standard patient payment. The API never holds the patient's key: the wallet
signs and submits, and the API verifies the result on-chain.

```mermaid
sequenceDiagram
    autonumber
    participant Web
    participant Wallet
    participant API
    participant DB
    participant SS as stellar-service
    participant Horizon
    participant Outbox
    participant Consumer

    Web->>API: POST /payments/intent<br/>amount, destination, assetCode, patientId
    API->>API: validate asset / issuer, fee budget
    API->>DB: create PaymentRecord<br/>status=pending, intentId, memo
    opt sponsorFee=true and budget allows
        API->>SS: POST /fee-bump
        SS-->>API: fee-bump XDR + hash
    end
    API-->>Web: 201 intentId, memo, destination,<br/>platformPublicKey, feeBump?
    Note over DB: State PENDING

    Web->>Wallet: build payment op with memo
    Wallet->>Horizon: submit signed transaction
    Note over Horizon: State SUBMITTED
    Horizon-->>Wallet: tx hash (ledger closed)

    par Path A: client confirms
        Wallet-->>Web: txHash
        Web->>API: PATCH /payments/:intentId/confirm<br/>txHash
        API->>DB: reject if txHash already confirmed on another intent
        API->>SS: GET /verify/:txHash
        SS->>Horizon: load transaction + operations
        Horizon-->>SS: transaction
        SS-->>API: found, memo, to, amount, asset, networkPassphrase
        alt memo / destination / amount / asset / network mismatch
            API->>DB: status=failed, txHash
            API-->>Web: 400 MemoMismatch / AmountMismatch / ...
            Note over DB: State FAILED
        else all checks pass
            API->>API: confirmPayment()
        end
    and Path B: payment stream
        SS->>Horizon: stream payments forAccount(platform), cursor=now
        Horizon-->>SS: payment record
        SS->>API: POST /webhooks/stellar<br/>memo, txHash, amount, from
        API->>DB: find PaymentRecord by memo, status=pending
        API->>API: confirmPayment(allowAlreadyConfirmed)
    end

    rect rgba(46, 160, 67, 0.12)
        Note over API,Outbox: confirmPayment(): one MongoDB transaction
        API->>DB: PaymentRecord status=confirmed,<br/>confirmedAt, exchangeRate, usdEquivalent
        API->>DB: Invoice (paymentIntentId) status=paid
        API->>Outbox: OutboxEvent payment.confirmed
    end
    Note over DB: State CONFIRMED
    API-->>Web: 200 payment
    API->>API: confirmation email to clinic

    Outbox->>Web: socket payment:confirmed (clinic room)
    Outbox->>API: in-app notification to clinic admins
    Outbox->>Consumer: webhook payment.confirmed (signed)
```

Notes:

- Whichever path confirms first wins. The status filter in `confirmPayment()`
  (`status != confirmed`) makes the second path a no-op (`already_confirmed`).
- `stellar-service` retries `POST /webhooks/stellar` 3 times on network errors
  or 5xx, and stops on 4xx.
- The exchange rate comes from the `xlm-rate` job's cache (`1` for USDC, `0` if
  no rate is available).

### Expiry and stale-payment cleanup

```mermaid
sequenceDiagram
    autonumber
    participant Jobs
    participant DB
    participant SS as stellar-service
    participant Horizon

    loop every 5 min: payment-expiration
        Jobs->>DB: updateMany status=pending, expiresAt < now<br/>set status=failed
        Note over DB: PENDING → FAILED
    end

    loop hourly: reconciliation
        Jobs->>DB: find pending, createdAt older than 24h
        loop each record with txHash
            Jobs->>SS: GET /verify/:txHash
            SS->>Horizon: load transaction
            Horizon-->>SS: result
            SS-->>Jobs: found / success
            alt found and successful
                Jobs->>DB: status=confirmed
                Note over DB: → CONFIRMED (status only, no outbox / invoice / email)
            else not found or failed
                Jobs->>DB: status=failed
                Note over DB: → FAILED
            end
        end
        Jobs->>DB: pending older than 24h without txHash → failed
    end
```

---

## Claimable balances

Insurance pre-authorisation holds the patient's estimated cost in a Stellar
claimable balance (`modules/pre-auth`). The clinic claims it after approval;
on denial or expiry the patient gets it back.

```mermaid
sequenceDiagram
    autonumber
    participant Web
    participant API
    participant DB
    participant SS as stellar-service
    participant Horizon
    participant Jobs

    Web->>API: POST /pre-auth<br/>patientPublicKey, estimatedAmount, procedureCode
    API->>SS: POST /claimable-balance<br/>from, amount, claimant, claimableUntil, memo PRE-AUTH:code
    SS->>Horizon: CreateClaimableBalance op
    Horizon-->>SS: balanceId
    SS-->>API: balanceId
    API->>DB: PreAuth status=pending,<br/>claimableBalanceId, expiresAt
    API-->>Web: 201 preAuth

    Web->>API: POST /pre-auth/:id/approve<br/>preAuthNumber
    API->>DB: status=approved

    alt clinic claims (approved, not expired)
        Web->>API: POST /pre-auth/:id/claim
        API->>SS: POST /claimable-balance/:balanceId/claim
        SS->>Horizon: ClaimClaimableBalance (platform key)
        Horizon-->>SS: txHash
        SS-->>API: txHash
        API->>DB: status=claimed, claimedAt
    else denied (pending or approved)
        Web->>API: POST /pre-auth/:id/deny
        API->>SS: POST /claimable-balance/:balanceId/reclaim
        SS->>Horizon: ClaimClaimableBalance (reclaim)
        Horizon-->>SS: txHash
        SS-->>API: txHash
        API->>DB: status=denied
    end

    loop hourly: claimable-expiry-notification
        Jobs->>DB: PaymentRecord claimableUntil within 24h,<br/>claimed != true, not yet notified
        Jobs->>Web: socket payment:claimable_expiring (patient)
        Jobs->>Jobs: email + in-app notification
        Jobs->>DB: claimableExpiryNotificationSent=true
    end
```

| Record                         | Created       | Claimed                                  | Reclaimed / denied              |
| ------------------------------ | ------------- | ---------------------------------------- | ------------------------------- |
| `PreAuth.status`               | `pending` → `approved` | `claimed`                       | `denied`                        |
| `PaymentRecord.status` (claimable records) | `pending` (PENDING) | `confirmed`, `claimed=true` (CONFIRMED) | `failed` (FAILED)           |

> `modules/payments/claimable-balance.controller.ts` (create / claim / reclaim on
> `PaymentRecord`) simulates the Stellar calls and isn't mounted on a route.
> The pre-auth flow above is the one that talks to Stellar.

---

## Escrow (Soroban)

The `contracts/escrow` Soroban contract holds a patient's tokens until the clinic
confirms service delivery. The patient can get a refund after 14 days, and either
party can raise a dispute.

```mermaid
sequenceDiagram
    autonumber
    actor Patient
    participant API
    participant DB
    participant SS as stellar-service
    participant Contract as Soroban escrow contract
    participant Token as Token contract (USDC)

    API->>DB: PaymentRecord paymentType=escrow,<br/>expiresAt = now + 30d
    API->>SS: POST /api/v1/soroban/escrow/create<br/>paymentId, amount, destination, encounterId
    SS->>Contract: deposit(patient, clinic, token, amount)
    Contract->>Patient: require_auth()
    Contract->>Token: transfer patient → contract
    Contract-->>SS: escrow_id + event (escrow, deposited)
    SS-->>API: contractId, txHash
    API->>DB: sorobanContractId, escrowStatus

    alt service delivered
        API->>SS: POST /api/v1/soroban/escrow/release
        SS->>Contract: release(escrow_id, clinic, token)
        Contract->>Token: transfer contract → clinic
        Contract-->>SS: event (escrow, released)
        SS-->>API: txHash
        API->>DB: escrowStatus, escrowReleasedAt
        Note over DB: CONFIRMED
    else 14 days passed without release
        Patient->>Contract: refund(escrow_id, patient, token)
        Contract->>Token: transfer contract → patient
        Contract-->>Patient: event (escrow, refunded)
        Note over DB: ROLLED_BACK
    else dispute raised
        Patient->>Contract: dispute(escrow_id, reason)
        Contract-->>Patient: event (escrow, disputed)
        Note over Contract: status Disputed, funds held
    else cancelled before release
        API->>SS: POST /api/v1/soroban/escrow/cancel
        SS-->>API: txHash
    end
```

| Contract `EscrowStatus` | State machine              |
| ----------------------- | -------------------------- |
| `Active`                | `SUBMITTED`                |
| `Released`              | `CONFIRMED`                |
| `Refunded`              | `ROLLED_BACK`              |
| `Disputed`              | `SUBMITTED` (funds held)   |
| `Cancelled`             | `FAILED`                   |

The API records the contract side on `PaymentRecord` in `sorobanContractId`,
`escrowStatus` and `escrowReleasedAt` (migration `20260528_add_soroban_escrow`).

> **Implementation status:** the API client is `SorobanEscrowService`
> (`modules/payments/services/soroban-escrow.service.ts`), but `stellar-service`
> doesn't expose the `/api/v1/soroban/escrow/*` routes yet. The diagram shows the
> intended contract interaction.

---

## Multisig approval

High-value payments that need M-of-N signatures before submission.

```mermaid
sequenceDiagram
    autonumber
    participant Web
    participant API
    participant DB
    actor Signer as Signers (N)
    participant SS as stellar-service
    participant Horizon

    Web->>API: POST /payments/multisig<br/>amount, currency, requiredSignatures, signers
    API->>API: 2 ≤ requiredSignatures ≤ signers.length
    API->>DB: PaymentRecord status=pending_signatures
    API->>DB: MultiSigPayment status=pending, signatures=[]
    API-->>Web: 201 signatureProgress 0/M
    Note over DB: PENDING

    loop until M signatures
        Signer->>API: GET /payments/multisig/pending/:signer
        API-->>Signer: payments awaiting this key
        Signer->>API: POST /payments/multisig/:paymentId/sign<br/>signer, signature
        API->>API: signer authorised and not already signed
        API->>DB: push signature
        API-->>Signer: signatureProgress n/M
    end

    API->>DB: MultiSigPayment + PaymentRecord<br/>status=ready_for_submission

    Note over API,SS: Submission (not yet called by the API)
    API->>SS: POST /multi-sig/build → /multi-sig/add-signature → /multi-sig/submit
    SS->>Horizon: submit transaction with M signatures
    Horizon-->>SS: txHash
    Note over DB: SUBMITTED → CONFIRMED / FAILED<br/>MultiSigPayment status submitted → confirmed / failed
```

> **Implementation status:** signature collection is implemented; submission is
> not. `stellar-service` exposes `/multi-sig/build`, `/multi-sig/add-signature` and
> `/multi-sig/submit`, but nothing in the API calls them. Also,
> `pending_signatures` and `ready_for_submission` are written to
> `PaymentRecord.status`, which the schema enum restricts to `pending`,
> `confirmed` and `failed`, so schema validation on create rejects
> `pending_signatures`.
> `calculateExpiryDate('multisig')` gives a 24 h expiry for multisig payments.

---

## Disputes and refunds

```mermaid
sequenceDiagram
    autonumber
    participant Web
    participant API
    participant DB
    participant SS as stellar-service
    participant Horizon

    Web->>API: POST /payments/:intentId/dispute<br/>patientId, reason, description
    API->>DB: one dispute per payment, else 409
    API->>DB: PaymentDispute status=open
    API->>API: audit DISPUTE_OPENED + email clinic

    Web->>API: POST /payments/disputes/:id/evidence
    API->>DB: status=evidence_submitted (from open)

    Web->>API: PUT /payments/disputes/:id/resolve<br/>status, outcome, refundAmount?, refundDestination?
    alt patient_favored / resolved_refund with refund details
        API->>API: within 30 days of payment<br/>0 < refundAmount ≤ original
        API->>SS: POST /refund<br/>toPublicKey, amount, memo refund-intentId
        SS->>Horizon: payment platform → patient
        Horizon-->>SS: txHash
        SS-->>API: transactionHash
        API->>DB: new PaymentRecord (refund)<br/>status=confirmed, txHash
        API->>API: audit REFUND_ISSUED
    end
    API->>DB: dispute status, resolution,<br/>refundIntentId
    API->>API: audit DISPUTE_RESOLVED + email clinic
    API-->>Web: 200 dispute (+ refund tx)

    opt refund later
        Web->>API: POST /payments/disputes/:id/refund<br/>amount, destinationPublicKey
        API->>SS: POST /refund
    end
```

| `PaymentDispute.status` | Meaning                                   |
| ----------------------- | ----------------------------------------- |
| `open`                  | Dispute raised                            |
| `evidence_submitted`    | At least one piece of evidence attached   |
| `under_review`          | Clinic reviewing                          |
| `resolved_refund`       | Resolved with a refund                    |
| `resolved_no_action`    | Resolved, no refund                       |
| `closed`                | Closed                                    |

In state-machine terms the original payment stays `CONFIRMED`. The refund is a
separate payment from the platform to the patient that is `CONFIRMED` when
created. `ROLLED_BACK` describes the pair.

---

## Recurring payments

```mermaid
sequenceDiagram
    autonumber
    participant Web
    participant API
    participant DB
    participant Sched as Recurring scheduler
    actor Patient

    Web->>API: POST /payments/recurring<br/>patientId, amount, currency, frequency, startDate, endDate?
    API->>DB: RecurringPayment status=active,<br/>nextPaymentDate

    Web->>API: PUT /payments/recurring/:id/pause | /resume | DELETE /:id
    API->>DB: status=paused | active | cancelled

    loop daily: processRecurringPayments()
        Sched->>DB: find status=active, nextPaymentDate ≤ now
        loop each due plan
            Sched->>Patient: email "Payment Request - Action Required"<br/>link to /payments/approve/:intentId
            Sched->>DB: paymentHistory += intentId, status=pending
        end
    end

    Note over Patient,API: Patient pays through the normal intent → confirmation flow

    alt attempt completed
        Sched->>DB: nextPaymentDate += frequency, failureCount=0
        Sched->>DB: status=completed once past endDate
    else attempt failed
        Sched->>DB: failureCount += 1
        Sched->>DB: status=paused when failureCount ≥ maxRetries
    end
```

> **Implementation status:** `scheduleRecurringPaymentProcessor()` isn't started
> anywhere and isn't registered with the JobRegistry, so the daily loop above doesn't
> run. Also, the generated `recurring_<id>_<ts>` intent id is never stored as a
> `PaymentRecord`, and there is no `/payments/approve/:intentId` route.
> Plan CRUD (create, pause, resume, cancel, update) works.

---

## Reconciliation of unrecognized transactions

Incoming payments to a clinic account that don't match any `PaymentRecord`.

```mermaid
sequenceDiagram
    autonumber
    participant Jobs as balance-monitoring (15 min)
    participant API
    participant DB
    participant SS as stellar-service
    participant Horizon
    actor Admin as Clinic admin

    loop every 15 min, per active clinic with stellarPublicKey
        Jobs->>SS: GET /balance/:publicKey
        SS->>Horizon: account + recent payments
        Horizon-->>SS: balances, transactions
        SS-->>Jobs: balance, usdcBalance, transactions
        Jobs->>DB: upsert BalanceSnapshot (clinic, UTC day)
        loop each incoming XLM transaction
            Jobs->>DB: PaymentRecord with txHash for this clinic?
            alt no matching record
                Jobs->>Admin: notification unrecognized_transaction + email
            end
            opt amount ≥ largeTransactionXlm
                Jobs->>Admin: notification large_transaction + email
            end
        end
    end

    Admin->>API: POST /payments/sync
    API->>SS: GET /balance/:publicKey
    SS-->>API: recent on-chain transactions
    API->>DB: all PaymentRecords for clinic
    API->>API: on-chain hash not in DB → unrecorded
    API->>DB: pending with on-chain hash → confirmed (stale_pending_fixed)
    API->>API: confirmed but not on-chain → confirmed_not_on_chain
    API->>API: pending older than 24h → stale_pending
    API-->>Admin: discrepancies[]

    opt cross-check against the ledger
        API->>SS: POST /reconcile<br/>expectedPayments, accountAddress, tolerance
        SS->>Horizon: fetch ledger transactions
        SS-->>API: matches + discrepancies report
        Admin->>SS: POST /reconcile/resolution<br/>discrepancyId, mark_resolved | investigate | manual_review
    end

    Admin->>API: GET /payments/reconciliation
    API-->>Admin: month-to-date totals + stale pending
```

`UnrecognizedTransaction` (`modules/payments/unrecognized`) is the persistent
record for these transactions: one row per `stellarTxHash`, with `resolved`,
`resolvedAt` and `resolvedBy`.
`detectUnrecognizedTransactions()` upserts rows and
`getUnrecognizedTransactions(clinicId)` lists the open ones. The balance monitor
alerts but doesn't write these rows yet.

---

## See also

- [Stellar Integration Guide](./overview.md)
- Repository docs: `docs/BACKGROUND_JOBS.md`, `docs/WEBHOOK_CONSUMER_GUIDE.md`, `docs/REALTIME_EVENTS.md`
