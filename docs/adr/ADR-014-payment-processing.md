# ADR-014: Payment Processing Architecture

## Status

Accepted

## Date

2024-05-15

## Context

Health Watchers must process payments for medical consultations across West Africa and the diaspora. Key requirements:

- Low transaction fees (traditional card rails charge 2–3 %; this is significant for micro-payments)
- Cross-border settlement without multi-currency bank account overhead
- Near-instant settlement to doctors after a consultation
- Support for payment splitting between clinic and attending doctor
- Reversibility — disputes and refunds must be possible
- A tamper-evident record of every payment on the blockchain

Traditional payment processors (Stripe, Flutterwave) were evaluated but either have limited coverage in target markets, high fee structures for the expected transaction volumes, or complex KYC requirements.

## Decision

### Stellar blockchain as the payment rail

**Stellar Network** (`stellar-sdk ^12`) is adopted as the payment processing layer for the following reasons:

1. **Fee model**: ~0.00001 XLM per operation (fraction of a cent) — viable for per-consultation micro-payments
2. **Settlement time**: 3–5 seconds to finality on the Stellar network
3. **Built-in primitives**: Claimable balances enable conditional payments (doctor claims after consultation); the DEX enables currency exchange
4. **Testnet**: Full testnet environment for development and staging with no real funds at risk

### Architecture

A dedicated **Stellar Service** (`apps/stellar-service`, port 3002) isolates blockchain interactions from the core API:

```
API Service (port 3001)
  → Stellar Service (port 3002)
    → Stellar Network (testnet / mainnet)
```

The separation means:
- Stellar SDK upgrades do not require touching the core API
- The Stellar service can be scaled independently during peak payment periods
- A Stellar network outage does not take down core clinical workflows

### Payment lifecycle

```
1. POST /api/v2/payments/intent    — create payment intent (DB record: status=pending)
2. Stellar Service builds tx       — validate amount, clinic wallet, doctor wallet
3. Submit to Stellar Network       — status=processing
4. Network confirmation (3–5 s)    — status=completed; stellarTxHash and ledger stored
5. Payment split                   — clinic and doctor amounts distributed per splitConfig
6. Reconciliation job (daily)      — verify DB records match on-chain state
```

If the network does not confirm within the expiry window, `startPaymentExpirationJob` marks the intent as `expired`.

### Payment splitting

Each clinic has a `paymentSplitConfig` document field defining the default clinic/doctor percentage split (e.g. 70 %/30 %). Per-doctor overrides are supported. The split is calculated and executed atomically with the main payment transaction using Stellar's multi-operation transaction support.

### Claimable balances

For scenarios where the receiving party (e.g. patient) has not yet created a Stellar account, **claimable balances** allow the payer to lock funds that the recipient can claim later. `startClaimableExpiryNotificationJob` alerts recipients approaching their claim deadline.

### XLM exchange rate

A background job (`startXLMRateJob`) fetches the live XLM/USD rate periodically and caches it in Redis. This rate is used for display-only conversion; all on-chain transactions are denominated in XLM.

### Dispute and refund handling

Disputes are handled off-chain (in the application DB) and resolved by a CLINIC_ADMIN or SUPER_ADMIN. An approved refund triggers a reverse Stellar transaction from the clinic wallet back to the patient. Refund state is tracked in the `paymentrecords` collection (`status: 'refunded'`).

### Environment separation

`STELLAR_NETWORK` env var controls which network is used:
- `testnet` — development and staging (default)
- `mainnet` — production only

Startup validation ensures `mainnet` is only active when `NODE_ENV=production`.

## Consequences

### Positive

- Transaction fees are negligible compared to traditional payment processors.
- Stellar testnet provides a realistic integration environment with no financial risk.
- On-chain payment records are immutable — they provide an audit trail that complements the application DB.
- Payment splitting is atomic — either both the clinic and doctor receive their share, or neither does.

### Negative / Trade-offs

- Stellar is less familiar to most developers than Stripe/PayPal; onboarding requires blockchain education.
- XLM price volatility means the local-currency value of a payment can change between invoice creation and settlement. A stablecoin or USDC anchor on Stellar could mitigate this, but adds complexity.
- Stellar's 3–5 second finality, while fast, is slower than card authorisation (~1 s); UI must handle the async confirmation flow.
- A separate Stellar service adds deployment and operational complexity.

### Neutral

- `stellarPublicKey` is stored on both the `users` (doctors) and `clinics` collections, with sparse indexes so non-Stellar users do not consume index space.

## Alternatives Considered

| Option | Why Rejected |
|--------|-------------|
| Stripe | Limited West African coverage; 2.9 % + 30¢ per transaction is prohibitive for micro-payments |
| Flutterwave | Better African coverage but still 1.4 % per transaction; no built-in payment splitting primitive |
| Bitcoin Lightning | High development complexity; less mature SDK ecosystem than Stellar |
| Ethereum / EVM | Gas fees unpredictable and often > transaction value for micro-payments |

## References

- `apps/stellar-service/` — Stellar service implementation
- `apps/api/src/modules/payments/` — payment intent and record management
- `apps/api/src/modules/payments/services/payment-expiration-job.ts`
- `apps/api/src/modules/payments/services/reconciliation-job.ts`
- `apps/api/src/modules/payments/services/xlm-rate-job.ts`
- `apps/api/src/config/env.ts` — `STELLAR_NETWORK` validation
- `docs/DATABASE_SCHEMA.md` — `paymentrecords` collection schema
- `.changeset/feat-payment-disputes-refunds.md`
