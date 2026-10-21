# Payment Issue Guide

Covers Stellar transactions, payment lifecycle, disputes, refunds, reconciliation, and recurring payments.

---

## Table of Contents

- [Payment Lifecycle Overview](#payment-lifecycle-overview)
- [Unconfirmed Transactions](#unconfirmed-transactions)
- [Payment Creation Failures](#payment-creation-failures)
- [Stellar Network Issues](#stellar-network-issues)
- [Dispute Workflow Issues](#dispute-workflow-issues)
- [Refund Issues](#refund-issues)
- [Reconciliation Issues](#reconciliation-issues)
- [Recurring Payment Issues](#recurring-payment-issues)
- [Claimable Balance Issues](#claimable-balance-issues)
- [Exchange Rate Issues](#exchange-rate-issues)
- [Batch Payment Issues](#batch-payment-issues)
- [Webhook Delivery Issues](#webhook-delivery-issues)
- [Audit & Compliance](#audit--compliance)

---

## Payment Lifecycle Overview

```
POST /api/v2/payments          → status: "pending"
  Stellar transaction submitted
  Horizon confirms tx          → status: "confirmed"  (via webhook from stellar-service)
  paymentExpirationJob fires   → status: "expired"    (if not confirmed within PAYMENT_INTENT_EXPIRY_HOURS)

Dispute workflow:
  POST /payments/:intentId/dispute          → dispute.status: "open"
  POST /payments/disputes/:id/evidence      → dispute.status: "evidence_submitted"
                                            → 7-day review period begins
  PUT  /payments/disputes/:id/resolve       → dispute.status: "resolved_refund" | "resolved_no_action" | "closed"
  POST /payments/disputes/:id/refund        → Stellar refund issued, dispute.status: "resolved_refund"
```

---

## Unconfirmed Transactions

### Payment stuck in `pending` status

**Step 1 — Check the Stellar transaction directly**

```bash
# Find the txHash on the payment record
mongosh "$MONGO_URI" --eval "
db.paymentrecords.findOne({ intentId: '<intentId>' }, { txHash: 1, status: 1, createdAt: 1 })
"

# Check on Horizon
curl "https://horizon-testnet.stellar.org/transactions/<txHash>"
# For mainnet: https://horizon.stellar.org/transactions/<txHash>
```

If Horizon shows the transaction as `successful`, the confirmation webhook from `stellar-service` was not received.

**Step 2 — Check `stellar-service` logs**

```bash
docker logs stellar-service 2>&1 | grep "<intentId>"
```

Look for errors in:
- Transaction submission to Horizon
- Webhook POST back to `API_URL/webhooks/stellar`

**Step 3 — Check webhook delivery**

```javascript
// In mongosh — find webhook delivery attempts for this payment
db.webhookdeliveries.find({
  "payload.intentId": "<intentId>"
}).sort({ createdAt: -1 })
```

If delivery failed, the retry worker should re-attempt. Verify `retryWorker` is running:
```bash
grep "retry-worker" /var/log/api/app.log | tail -5
```

**Step 4 — Check `STELLAR_SERVICE_URL` reachability**

```bash
curl "$STELLAR_SERVICE_URL/health"
```

If unreachable from the API pod, the webhook POST will fail silently.

**Step 5 — Check payment expiry**

`paymentExpirationJob` sets payments to `expired` after `PAYMENT_INTENT_EXPIRY_HOURS` (default: 24 hours).

```bash
echo $PAYMENT_INTENT_EXPIRY_HOURS  # default: 24
```

If the payment expired before confirmation, re-create the payment intent.

---

### Transaction confirmed on Horizon but not in the database

**Cause:** Webhook delivery from `stellar-service` to the API failed.

**Manual reconciliation:**
```javascript
// Update the payment record directly (SUPER_ADMIN operation)
db.paymentrecords.updateOne(
  { intentId: "<intentId>" },
  {
    $set: {
      status: "confirmed",
      txHash: "<txHash>",
      confirmedAt: new Date()
    }
  }
)
```

Always create an audit log entry for manual reconciliations.

---

## Payment Creation Failures

### `Payment rate limit exceeded` (HTTP 429)

The payment limiter caps at **20 requests per minute per clinic**.

**Fix:** Batch payment creation, or spread requests across the minute window. For bulk payments, use `POST /api/v1/payments/batch`.

---

### `400` on payment creation — validation failure

Check the `details[]` array in the response. Common validation failures:

| Field | Common issue |
|---|---|
| `amount` | Zero, negative, or non-numeric string |
| `destination` | Not a valid Stellar public key (must be 56-char G... address) |
| `assetCode` | Not in `SUPPORTED_ASSETS` list |
| `patientId` | Invalid MongoDB ObjectId |

---

### `STELLAR_DRY_RUN=true` — no real transactions

If payments are accepted but nothing appears on the Stellar network:

```bash
echo $STELLAR_DRY_RUN  # must be 'false' in production
```

Set `STELLAR_DRY_RUN=false` to send real transactions.

---

### Insufficient XLM balance

**Symptom:** `stellar-service` logs `OperationFailed: insufficient balance`

**Check balance:**
```bash
curl "https://horizon-testnet.stellar.org/accounts/$STELLAR_PLATFORM_PUBLIC_KEY" \
  | jq '.balances[] | select(.asset_type == "native")'
```

**Fix:** Fund the platform account. On testnet: use the Stellar [Friendbot](https://laboratory.stellar.org/#?network=test). On mainnet: transfer XLM to `STELLAR_PLATFORM_PUBLIC_KEY`.

---

### Transaction amount exceeds `STELLAR_MAX_TRANSACTION_XLM`

**Symptom:** `400` error with amount limit message.

```bash
echo $STELLAR_MAX_TRANSACTION_XLM  # default: 1000
```

**Fix:** Increase the limit in configuration after documenting the change in your security policy. For very large transactions, consider splitting into multiple payments.

---

## Stellar Network Issues

### Wrong network (testnet vs mainnet)

**Symptom:** Transaction hashes are valid but don't appear on the expected Horizon.

```bash
echo $STELLAR_NETWORK         # 'testnet' or 'mainnet'
echo $MAINNET_CONFIRMED       # must be 'true' for mainnet
```

Testnet and mainnet are completely separate networks — accounts and balances do not cross over.

---

### Horizon API unavailable

**Symptom:** All payments fail with a connection error to Horizon.

**Check Stellar network status:**
```bash
# Testnet
curl https://horizon-testnet.stellar.org/

# Mainnet
curl https://horizon.stellar.org/

# Check Stellar status page
curl https://status.stellar.org/
```

**Fix:** Payments will fail until Horizon is available. The `STELLAR_TX_TIMEOUT_SECONDS` (default: 30s) prevents indefinite hanging.

---

### Transaction timeout

Stellar transactions include a `timebounds` parameter. If the transaction is not submitted within `STELLAR_TX_TIMEOUT_SECONDS`, it expires.

| Payment type | Recommended timeout |
|---|---|
| Immediate | `STELLAR_TX_TIMEOUT_SECONDS=30` |
| Multi-sig | 86400 (24 hours) |
| Escrow | 2592000 (30 days) |

---

### `MAINNET_CONFIRMED` not set

```
stellar-service exited with code 1
Error: MAINNET_CONFIRMED must be 'true' to use mainnet
```

**Fix:** Set `MAINNET_CONFIRMED=true` in the `stellar-service` environment. This is a deliberate safety gate — confirm you intend to use real mainnet XLM.

---

## Dispute Workflow Issues

### `Dispute already exists for this payment` (HTTP 409)

Only one dispute per payment intent is allowed.

**Fix:** Retrieve the existing dispute:
```bash
curl -H "Authorization: Bearer <token>" \
  "http://localhost:4000/api/v1/payments/disputes?intentId=<intentId>"
```

If the original dispute was incorrectly closed, a SUPER_ADMIN can re-open it via direct DB update.

---

### Cannot submit evidence on a resolved dispute

```json
{ "error": "Cannot submit evidence on a resolved or closed dispute" }
```

Evidence can only be submitted when `dispute.status` is `open` or `evidence_submitted`.

**Dispute status transitions:**
```
open → evidence_submitted → resolved_refund
                          → resolved_no_action
                          → closed
```

Once resolved or closed, no further evidence is accepted.

---

### Resolution blocked by review period (HTTP 425)

```json
{
  "error": "Review period is still active. Dispute cannot be resolved until <date>.",
  "reviewDeadline": "2026-09-06T..."
}
```

The 7-day review period begins when evidence is first submitted. The `Retry-After` header shows how many seconds remain.

**Override:** SUPER_ADMIN can bypass this restriction — the check is skipped for `req.user.role === 'SUPER_ADMIN'`.

---

### `Dispute not found` (HTTP 404)

**Causes:**
- Wrong `disputeId`
- Dispute belongs to a different clinic (clinic-scoped query)

**Check:**
```javascript
db.paymentdisputes.findOne({ _id: ObjectId("<disputeId>") }, { clinicId: 1 })
// Verify the clinicId matches the token's clinicId
```

---

### Dispute resolution email not sent

Dispute emails (`sendDisputeOpenedEmail`, `sendDisputeResolvedEmail`) are sent to `clinic-<clinicId>@healthwatchers.com` — a placeholder pattern.

**Fix:** Update `clinicEmail()` in `dispute.controller.ts` to use the actual clinic admin email from the clinic record.

---

## Refund Issues

### `Refund already issued for this dispute` (HTTP 409)

Each dispute allows only one refund (checked via `dispute.refundIntentId`).

**Check the existing refund:**
```javascript
db.paymentdisputes.findOne(
  { _id: ObjectId("<disputeId>") },
  { refundIntentId: 1, resolution: 1 }
)
// Use refundIntentId to look up the refund payment record
db.paymentrecords.findOne({ intentId: "<refundIntentId>" })
```

---

### Refund window expired

```json
{ "error": "Refund window expired. Refunds must be issued within 30 days of original payment." }
```

The `REFUND_WINDOW_DAYS` (30 days) is measured from the original payment's `createdAt` date.

**Exception process:** For legitimate refunds outside the window:
1. SUPER_ADMIN manually issues a Stellar transaction to the patient.
2. Creates a manual `paymentrecords` entry with status `confirmed` and a note in `memo`.
3. Updates the dispute `resolution` manually.
4. Creates an audit log entry.

---

### Refund amount validation

```json
{ "error": "Refund amount must be between 0 and <originalAmount>" }
```

- Amount must be > 0
- Amount must be ≤ the original payment amount (no over-refunding)
- Amount must be a valid number string

For partial refunds, submit the partial amount. The dispute's `resolution.refundAmount` records what was refunded.

---

### Destination public key invalid

**Symptom:** Stellar `issueRefund()` fails with an invalid account error.

**Valid Stellar public key format:** 56 characters, starts with `G`.

Example: `GAHJJJKMOKYE4RVPZEWZTKH5FVI4PA3VL7GK2LFNUBSGBV3KU5WFNZM`

**Fix:** Verify the `destinationPublicKey` from the patient's wallet. Public keys can be validated: they use Stellar's base32 encoding with a checksum.

---

## Reconciliation Issues

### Reconciliation job not running

```bash
grep "reconciliation" /var/log/api/app.log | grep -i "start\|error\|stop"
```

If no entries, the job failed to start. Check for startup exceptions before the job registration line.

---

### Payment records out of sync with Stellar

The `reconciliationJob` compares `paymentrecords` with Stellar Horizon transaction history.

**Manual reconciliation check:**
```javascript
// Find payments confirmed in DB but not on Stellar (potential ghost payments)
const payments = db.paymentrecords.find({ status: "confirmed" }).toArray();
// For each, check:
// curl https://horizon-testnet.stellar.org/transactions/<txHash>
```

---

### `reconciliationJob` failing silently

**Diagnose:**
```bash
jq 'select(.msg | test("reconcil"; "i"))' /var/log/api/app.log | tail -20
```

**Common causes:**
- Stellar Horizon unreachable
- `STELLAR_PLATFORM_PUBLIC_KEY` not set — can't query account history
- Rate limiting from Horizon (429) — the Horizon public API has rate limits

---

## Recurring Payment Issues

### Recurring payment not executing on schedule

```javascript
// Check the recurring payment record
db.recurringpayments.findOne({ _id: ObjectId("...") }, {
  status: 1,
  nextRunAt: 1,
  lastRunAt: 1,
  failureCount: 1
})
```

**Common causes:**

| Status | Meaning | Fix |
|---|---|---|
| `paused` | Manually paused | Resume via `PATCH /payments/recurring/:id` |
| `failed` | Too many consecutive failures | Check `failureCount`; fix the underlying issue and reset |
| `cancelled` | Permanently stopped | Create a new recurring payment |

**Check scheduler logs:**
```bash
jq 'select(.msg | test("recurring"; "i"))' /var/log/api/app.log | tail -20
```

---

### Recurring payment double-charging

**Cause:** `recurringPaymentScheduler` fired twice for the same schedule (e.g., during a rolling restart).

**Prevention:** The scheduler should use an idempotency key. Check `lastRunAt` — if it's within the current period, skip execution.

**Remediation:**
1. Identify duplicate payments by `patientId + amount + date`.
2. Issue a refund for the duplicate via `POST /payments/disputes/:id/refund`.
3. Add dispute with `reason: "duplicate_charge"`.

---

## Claimable Balance Issues

### Claimable balance expiry notification not sent

The `claimableExpiryNotificationJob` runs on a schedule and sends notifications before claimable balances expire.

**Check:**
```bash
grep "claimable-expiry" /var/log/api/app.log | tail -10
```

Ensure `SMTP_HOST` is configured — without it, notification emails fail silently.

---

### Balance monitoring alerts not firing

The `balanceMonitoringJob` monitors the platform's Stellar balance and alerts when it falls below threshold.

**Check:**
```bash
grep "balance-monitoring" /var/log/api/app.log | tail -10
echo $STELLAR_PLATFORM_PUBLIC_KEY  # must be set
```

---

## Exchange Rate Issues

### XLM exchange rate stale

The `xlmRateJob` fetches the current XLM/USD rate on a schedule.

**Check:**
```javascript
// Current rate in cache
redis-cli -u "$REDIS_URL" GET "xlm:rate:usd"
```

**If stale:** Check if the rate job is running and if the external rate API is reachable:
```bash
grep "xlm-rate" /var/log/api/app.log | tail -5

# The rate is fetched from CoinGecko or similar
curl "https://api.coingecko.com/api/v3/simple/price?ids=stellar&vs_currencies=usd"
```

---

## Batch Payment Issues

### Batch payment partially fails

`POST /api/v1/payments/batch` processes payments individually. If some fail and some succeed, the response includes a `results` array with per-payment outcomes.

**Check the results array:**
```json
{
  "results": [
    { "index": 0, "status": "success", "intentId": "..." },
    { "index": 1, "status": "failed", "error": "Insufficient balance" },
    { "index": 2, "status": "success", "intentId": "..." }
  ]
}
```

Failed items must be retried individually — there is no automatic retry for batch items.

---

### Batch payment rate-limited

The `paymentLimiter` caps at 20 requests per minute per clinic. A batch of 50 payments submitted at once may still hit this limit internally.

**Fix:** Throttle batch submissions to stay within the limit, or use smaller batches with delays.

---

## Webhook Delivery Issues

### Webhooks not being delivered

```javascript
// Check failed deliveries
db.webhookdeliveries.find({
  status: { $in: ["failed", "retrying"] }
}).sort({ createdAt: -1 }).limit(20)
```

**Retry worker status:**
```bash
grep "retry-worker" /var/log/api/app.log | tail -10
```

The retry worker requires Redis (BullMQ). If `REDIS_URL` is not set, webhook retries do not work.

---

### Webhook signature verification failing

The insurance reimbursement webhook requires HMAC signature verification using `INSURANCE_WEBHOOK_SECRET`.

**Diagnose:**
```bash
# Check if the secret is set
echo ${INSURANCE_WEBHOOK_SECRET:+set} # prints "set" if configured
```

**Fix:** Ensure `INSURANCE_WEBHOOK_SECRET` matches the secret configured at the insurance provider. Both sides must use the same key.

---

## Audit & Compliance

### Payment audit trail

Every payment action generates an audit log entry. Key actions:

| Action | Trigger |
|---|---|
| `PAYMENT_CREATED` | Payment intent created |
| `PAYMENT_CONFIRMED` | Stellar transaction confirmed |
| `REFUND_ISSUED` | Refund processed via Stellar |
| `DISPUTE_OPENED` | Dispute created for a payment |
| `DISPUTE_RESOLVED` | Dispute resolved (refund or no action) |

```javascript
// Audit log for a payment
db.auditlogs.find({
  resourceType: "PaymentRecord",
  "metadata.intentId": "<intentId>"
}).sort({ createdAt: 1 })
```

### Required fields for payment compliance

Every payment record must have:
- `intentId` — unique identifier (UUID)
- `clinicId` — tenant isolation
- `patientId` — patient association
- `amount` — numeric string
- `assetCode` — `XLM`, `USDC`, etc.
- `status` — `pending | confirmed | expired | failed`
- `txHash` — Stellar transaction hash (once confirmed)

Missing any of these on confirmed payments is a compliance gap.

---

## Quick Diagnosis Checklist

```
Payment not confirmed?
[ ] Check txHash on Horizon directly
[ ] Check stellar-service logs for submission errors
[ ] Verify STELLAR_SERVICE_URL is reachable
[ ] Check webhook delivery records
[ ] Confirm STELLAR_NETWORK matches Horizon URL

Refund failing?
[ ] Payment is within 30-day refund window
[ ] Refund amount is ≤ original payment amount
[ ] No existing refund on this dispute (refundIntentId not set)
[ ] destinationPublicKey is valid Stellar address
[ ] Platform account has sufficient XLM balance

Dispute blocked?
[ ] Dispute status is 'open' or 'evidence_submitted' (not resolved/closed)
[ ] Review period has elapsed (or requestor is SUPER_ADMIN)
[ ] One dispute per payment only
```
