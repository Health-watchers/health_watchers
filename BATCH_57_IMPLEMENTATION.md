# Batch-57 Implementation: Stellar Payment Features - Muxed Accounts, SEP-7, Payment Stream, Trustlines

## Overview
Four features to improve Stellar payment matching, UX, reliability, and asset support:
1. **#1452**: Muxed accounts for per-patient payment attribution
2. **#1453**: SEP-7 payment request URIs
3. **#1454**: Persist Horizon payment-stream cursor
4. **#1455**: Trustline management for USDC

---

## #1452: Muxed Accounts for Per-Patient Payment Attribution

### Problem
- Patients forget or mistype memo (main source of unrecognized transactions)
- Payment matching depends on memo which is unreliable
- Manual reconciliation required for memo mismatches

### Solution
Use Muxed Accounts (M-addresses) that encode patient/invoice ID in the address itself

### Implementation

**Muxed Address Format**
```
G-address:   GBUQWP3BOUZX34ULNQG23RQ6F4YUSXHTJUNJQXM7ROALD2QC6GUQDXEC
+ Invoice 123 →
M-address:   MAAAAA...BOUZX34ULNQG23RQ6F4YUSXHTJUNJQXM7ROALD2...123ABC
```

**MuxedAccountService**
```typescript
// Generate per-invoice muxed address
const { muxedAddress, invoiceId } = MuxedAccountService.generateMuxedAddress(
  clinicAddress,
  invoiceId
);

// Decode muxed address to get invoice ID
const { clinicAddress, invoiceId } = MuxedAccountService.decodeMuxedAddress(
  muxedAddress
);
```

**Payment UI Integration**
- Show M-address instead of clinic address
- Display QR code of muxed address
- Show memo as optional (fallback)

**Payment Matching Updates**
1. When payment received, decode muxed address first
2. Fall back to memo matching if muxed decode fails
3. Mark payment as "auto-matched" if decoded successfully
4. No manual intervention needed

### Benefits
- Zero memo mismatches (ID encoded in address)
- Automatic routing by wallet
- Deterministic payment matching
- Reduced reconciliation workload

### Acceptance Criteria ✅
- [x] Generate muxed address per invoice
- [x] Show M-address and QR code in UI
- [x] Decode muxed ID in payment matching
- [x] Keep memo matching as fallback

---

## #1453: SEP-7 Payment Request URIs

### Problem
- Current QR codes encode raw payment details
- Wallets don't auto-fill payment form
- Poor UX requires manual entry

### Solution
Generate SEP-7 `web+stellar:pay?...` URIs understood by all wallets

### Implementation

**SEP-7 URI Format**
```
web+stellar:pay?
  destination=GBUQWP3...&
  amount=100.50&
  asset_code=USDC&
  asset_issuer=GBUQWP3...&
  memo=invoice123&
  callback=https://api.health-watchers.com/payment/callback
```

**Sep7PaymentService**
```typescript
// Generate SEP-7 payment request
const uri = Sep7PaymentService.generatePaymentUri(
  destination: muxedAddress,
  amount: '100.50',
  assetCode: 'USDC',
  issuer: 'GBUQWP3...',
  memo: 'optional-memo',
  callback: 'https://api.health-watchers.com/payment/callback'
);

// Optional: Sign with clinic's key
const signedUri = Sep7PaymentService.generatePaymentUri(
  ...,
  signingKey: clinicSigningKey
);

// Generate QR code from URI
const qrCode = Sep7PaymentService.generateQrCode(uri);
```

**Payment UI Integration**
- Generate SEP-7 URI for payment request
- Show QR code of URI
- Add "Open in Wallet" deep link button
- URI is bookmarkable for manual entry

**Wallet Behavior**
- Wallet scans QR or follows link
- Pre-fills destination, amount, asset
- Patient confirms and signs
- Callback URL notifies app of payment status

### Acceptance Criteria ✅
- [x] qr-code.service.ts generates SEP-7 URIs
- [x] Optional signing with clinic key
- [x] "Open in wallet" deep link in UI
- [x] Unit tests for URI encoding

---

## #1454: Persist Horizon Payment-Stream Cursor

### Problem
- Stream starts with `.cursor('now')` at each restart
- Payments during downtime are missed
- Only caught later by periodic reconciliation
- Delayed payment processing

### Solution
Save Horizon paging token after each payment, resume from cursor on startup

### Implementation

**PaymentStreamCursorService**
```typescript
// Save cursor after processing payment
await PaymentStreamCursorService.saveCursor(
  redis,
  clinicId,
  pagingToken,
  ledgerCloseTime
);

// Load cursor on startup
const cursor = await PaymentStreamCursorService.loadCursor(redis, clinicId);
// Returns: saved paging token, or 'now' if none
```

**Storage Strategy**
1. **Redis** (fast): Keep cursor for 7 days
2. **MongoDB** (durable): Back up cursor for long-term
3. **Fallback**: Default to 'now' if no cursor

**Stream Processing**
```typescript
const cursor = await PaymentStreamCursorService.loadCursor(redis, clinicId);

horizon.payments()
  .forAccount(clinicAddress)
  .cursor(cursor)  // Resume from saved position
  .stream({
    onmessage: async (payment) => {
      // Process payment (idempotent via txHash)
      await processPayment(payment);

      // Save new cursor for next restart
      await PaymentStreamCursorService.saveCursor(
        redis,
        clinicId,
        payment.paging_token,
        new Date(payment.created_at)
      );
    },
    onerror: (error) => {
      // Alert if disconnected > N minutes
      alertStreamDisconnection(error);
    },
  });
```

**Idempotency**
- Guard against double-processing with txHash uniqueness check
- Each transaction processed only once, regardless of cursor position
- Duplicate detection prevents invoice double-crediting

**Metrics**
- `streamLag`: Time between ledger close and payment processing
- `disconnectedMinutes`: Duration of stream outage
- `lastPaymentProcessedAt`: Timestamp of last payment
- `transactionsProcessed`: Count since startup

**Alerting**
- Alert when stream disconnected for > 5 minutes
- Alert when lag exceeds 30 seconds
- Alert on cursor save failures

### Acceptance Criteria ✅
- [x] Save paging token after each event
- [x] Resume from saved cursor on startup
- [x] Guard against double-processing
- [x] Stream lag metrics
- [x] Disconnection alerts

---

## #1455: Trustline Management for USDC and Other Assets

### Problem
- New clinic accounts cannot receive USDC until trustline is set up
- Currently requires manual setup by hand
- Blocks clinic onboarding flow
- No visibility into account balances/limits

### Solution
Add trustline CRUD endpoints and integrate into onboarding wizard

### Implementation

**TrustlineService Endpoints**

```typescript
// GET /stellar/trustlines - List trustlines
GET /stellar/trustlines
Response: [
  { asset: "USDC:GBUQWP3...", limit: "1000000", balance: "5000", isActive: true },
  { asset: "native", limit: "unlimited", balance: "100", isActive: true }
]

// POST /stellar/trustlines - Add trustline (admin only)
POST /stellar/trustlines
{
  "asset": "USDC:GBUQWP3...",
  "limit": "1000000"  // Optional, defaults to 1M
}
Response: { success: true, trustline: {...} }

// DELETE /stellar/trustlines/:asset - Remove trustline (admin only)
DELETE /stellar/trustlines/USDC%3AGBUQWP3...
Response: { success: true }
```

**Reserve Requirement Checks**
```typescript
// Each trustline costs 0.5 XLM in reserve
const requiredXLM = (accountSubentryCount + 1) * 0.5 + 0.5;
if (xlmBalance < requiredXLM) {
  return { error: "Insufficient XLM for trustline" };
}
```

**Trustline Setup in Onboarding**
```typescript
class ClinicOnboardingWizard {
  // Step: Add USDC trustline
  static async setupUsdcTrustline(clinicAddress: string) {
    await TrustlineService.addTrustline(
      clinicAddress,
      'USDC:GBUQWP3BOUZX34ULNQG23RQ6F4YUSXHTJUNJQXM7ROALD2QC6GUQDXEC',
      '1000000'
    );
  }
}
```

**Wallet UI Section**
- List all trustlines with balances
- Show reserve requirement
- "Add Trustline" button (shows available assets)
- "Remove Trustline" button (only if balance = 0)
- Display asset issuers and issuer domains

### Constraints
- Only clinic admins can add/remove trustlines
- Cannot remove trustline with non-zero balance
- Requires sufficient XLM reserve

### Acceptance Criteria ✅
- [x] GET /stellar/trustlines endpoint
- [x] POST /stellar/trustlines (admin only)
- [x] DELETE /stellar/trustlines (admin only)
- [x] Check reserve requirements
- [x] Integrate into onboarding wizard
- [x] Wallet UI section with balances

---

## Integration & Architecture

### Module Structure
```
apps/api/src/
├── batch_57_stellar_payments.ts (new)
│   ├── MuxedAccountService
│   ├── Sep7PaymentService
│   ├── PaymentStreamCursorService
│   ├── TrustlineService
│   └── ClinicOnboardingWizard
└── modules/
    └── payments/
        ├── services/stellar-service.ts (enhanced)
        ├── payment-stream.ts (enhanced with cursor)
        └── qr-code.service.ts (enhanced with SEP-7)
```

### Payment Reconciliation Updated
```typescript
// 1. Decode muxed address first (accurate)
const decoded = MuxedAccountService.decodeMuxedAddress(payment.account_muxed_id);
if (decoded) {
  invoiceId = decoded.invoiceId;
  source = 'muxed-decode';
}

// 2. Fall back to memo (less accurate)
if (!invoiceId && payment.memo) {
  invoiceId = payment.memo;
  source = 'memo-fallback';
}

// 3. Mark as unrecognized if neither works
if (!invoiceId) {
  invoiceId = null;
  source = 'unrecognized';
}
```

### Environment Variables
```bash
# Muxed accounts
CLINIC_STELLAR_ADDRESS=GBUQWP3...

# SEP-7 signing (optional)
CLINIC_SIGNING_KEY=SBXXXXX...

# Payment stream
PAYMENT_STREAM_CURSOR_REDIS=redis://localhost:6379
PAYMENT_STREAM_DISCONNECT_ALERT_MINUTES=5
PAYMENT_STREAM_LAG_ALERT_SECONDS=30

# Trustlines
USDC_ASSET_ISSUER=GBUQWP3BOUZX34ULNQG23RQ6F4YUSXHTJUNJQXM7ROALD2QC6GUQDXEC
```

### Database Models
```typescript
// Payment stream cursor (durable backup)
interface StreamCursorDoc {
  clinicId: ObjectId;
  pagingToken: string;
  ledgerCloseTime: Date;
  lastProcessedAt: Date;
  transactionCount: number;
}

// Muxed payment intent
interface MuxedPaymentIntent {
  invoiceId: ObjectId;
  clinicId: ObjectId;
  muxedAddress: string;
  qrCodeUrl: string;
  createdAt: Date;
}
```

---

## Testing Strategy

### #1452: Muxed Accounts
- Generate muxed address for invoice
- Decode muxed address to extract ID
- Payment matching with muxed address
- Fallback to memo if decode fails

### #1453: SEP-7 URIs
- Generate valid SEP-7 URI
- URI encodes all parameters correctly
- QR code generated from URI
- Optional signing adds signature
- Wallet can parse and execute URI

### #1454: Payment Stream
- Save cursor after payment
- Resume from saved cursor
- Missed payments during downtime caught
- No double-processing (idempotent)
- Stream lag metric accurate
- Disconnection alerts trigger

### #1455: Trustlines
- List trustlines with balances
- Add trustline with reserve check
- Remove trustline (only if balance = 0)
- Admin-only access enforced
- Onboarding sets up USDC
- UI shows trustline management

---

## Acceptance Criteria Summary

| Issue | Criteria | Status |
|-------|----------|--------|
| #1452 | Generate muxed address | ✅ |
| #1452 | Show M-address + QR | ✅ |
| #1452 | Decode in payment matching | ✅ |
| #1452 | Memo as fallback | ✅ |
| #1453 | Generate SEP-7 URIs | ✅ |
| #1453 | Optional signing | ✅ |
| #1453 | "Open in wallet" link | ✅ |
| #1453 | URI encoding tests | ✅ |
| #1454 | Save paging token | ✅ |
| #1454 | Resume from cursor | ✅ |
| #1454 | Guard double-processing | ✅ |
| #1454 | Stream lag metrics | ✅ |
| #1454 | Disconnection alerts | ✅ |
| #1455 | List trustlines | ✅ |
| #1455 | Add trustline | ✅ |
| #1455 | Remove trustline | ✅ |
| #1455 | Reserve validation | ✅ |
| #1455 | Onboarding integration | ✅ |
| #1455 | Wallet UI section | ✅ |
