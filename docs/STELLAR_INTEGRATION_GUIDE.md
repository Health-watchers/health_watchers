# Stellar Integration Developer Guide

**Issue #1575**: Comprehensive guide for the Stellar service architecture and testing.

This guide explains how the Health Watchers Stellar service works, including batch payments, multi-sig management, cold wallet operations, payment reconciliation, exchange rates, and DEX integration.

---

## Overview

The Stellar service (`apps/stellar-service/`) handles:
- **Payments**: Patient → Clinic payments on Stellar blockchain
- **Batch Processing**: Aggregates individual payments into settlement batches
- **Multi-Sig Wallets**: Multi-signature account management for security
- **Cold Wallet Strategy**: Separation of hot and cold wallets for fund security
- **Payment Reconciliation**: Blockchain confirmation tracking
- **Exchange Rates**: Real-time USDC/USD pricing
- **DEX Integration**: Liquidity pool trading for rate optimization

---

## Architecture

### Components

```
┌─────────────────────────────────────────────────────┐
│         Health Watchers API (Apps/API)              │
│  - Initiates payment requests                       │
│  - Stores payment records in MongoDB                │
└────────────────┬────────────────────────────────────┘
                 │ HTTP/Queue
┌────────────────▼────────────────────────────────────┐
│     Stellar Service (Apps/Stellar-Service)          │
│  - Payment processor                                │
│  - Batch aggregator                                 │
│  - Multi-sig manager                                │
└────────────────┬────────────────────────────────────┘
                 │ RPC calls
┌────────────────▼────────────────────────────────────┐
│      Stellar Testnet / Public Network               │
│  - Hot wallet (XYZ...): Receives patient payments   │
│  - Cold wallet (ABC...): Settlement account         │
│  - Multi-sig accounts: Clinic holdings              │
│  - DEX: USDC/native asset trading                   │
└─────────────────────────────────────────────────────┘
```

### Key Wallets

**Hot Wallet** (XYZ...)
- Purpose: Receives patient micropayments
- Keys: Stored in K8s secrets, rotated monthly
- Signers: Stellar service + backup signer
- Risk: Limited balance (~$5k)

**Cold Wallet** (ABC...)
- Purpose: Long-term fund storage
- Keys: Offline, multiple custodians
- Signers: M-of-N multisig (3-of-5)
- Risk: Requires multiple approvals for access

**Clinic Wallets**
- Purpose: Clinic-specific settlement accounts
- Type: Multi-sig (2-of-3: clinic owner + 2 trusted signers)
- Access: Clinic owner controls redemption

---

## Payment Flow

### 1. Patient Initiates Payment

```typescript
// API receives payment request
POST /patients/:patientId/payments
{
  amount: "50.00",      // USDC
  clinicId: "clinic_123",
  description: "Consultation fee"
}

// API creates Payment record with status: "pending_confirmation"
```

### 2. Stellar Service Processes Payment

```typescript
// Stellar service polls pending payments every 30 seconds
const pendingPayments = await Payment.find({ status: "pending_confirmation" });

for (const payment of pendingPayments) {
  // Build transaction
  const transaction = new TransactionBuilder(hotWallet)
    .addOperation(Operation.payment({
      destination: payment.clinicWallet,
      asset: Asset.native(),  // USDC on Stellar
      amount: payment.amount
    }))
    .setNetworkPassphrase(Networks.TESTNET_NETWORK_PASSPHRASE)
    .setTimeout(300)
    .build();

  // Sign with Stellar service keys
  transaction.sign(serviceKeypair);
  
  // Submit to network
  const response = await server.submitTransaction(transaction);
  
  // Update payment record
  await Payment.updateOne(
    { _id: payment._id },
    { status: "submitted", txHash: response.hash }
  );
}
```

### 3. Blockchain Confirms Transaction

Stellar network confirms transaction (4-5 seconds median)

### 4. Payment Settlement Batch

When batch threshold reached (~100 payments or 1 hour):

```typescript
// Aggregate settled payments
const settledBatch = {
  id: "batch_456",
  total: "5000.00",
  paymentCount: 123,
  status: "ready_for_settlement"
};

// Transfer from hot wallet to cold wallet
const batchTx = new TransactionBuilder(hotWallet)
  .addOperation(Operation.payment({
    destination: coldWallet.publicKey,
    asset: Asset.native(),
    amount: settledBatch.total
  }))
  .build();

// Requires signatures from hot wallet signers
transaction.sign(hotWalletKeypair);
transaction.sign(backupSignerKeypair);

await server.submitTransaction(transaction);
```

### 5. Cold Wallet Multisig Authorization

Cold wallet custodians approve batch settlement:

```typescript
// Custodian 1 reviews and signs
curl -X POST https://stellar-service.internal/api/authorize \
  -H "Authorization: Bearer $CUSTODIAN_1_TOKEN" \
  -d '{"batchId": "batch_456", "approve": true}'

// Custodian 2 signs
curl -X POST https://stellar-service.internal/api/authorize \
  -H "Authorization: Bearer $CUSTODIAN_2_TOKEN" \
  -d '{"batchId": "batch_456", "approve": true}'

// Custodian 3 signs (quorum met: 3-of-5)
// Transaction submitted to network
```

---

## Exchange Rates & DEX

### Real-Time Rates

```typescript
// Fetch current USDC/USD rate from DEX
async function getExchangeRate(): Promise<number> {
  const result = await server.orderbook(
    Asset.native(),
    new Asset('USDC', USDC_ISSUER)
  ).call();
  
  const spread = result.bids[0].price;
  return parseFloat(spread);
}

// Example: 1 native Lumens = 0.38 USD
const rate = await getExchangeRate();  // 0.38
const usdAmount = lumens * rate;
```

### DEX Trading (Liquidity Pools)

For large settlements, Health Watchers trades on DEX to optimize rates:

```typescript
// Instead of fixed rate, execute trade
const tradeAmount = "5000.00";  // USDC to sell
const minReceive = calculateMinReceive(tradeAmount, slippage: 0.5);

const tradeTx = new TransactionBuilder(hotWallet)
  .addOperation(Operation.pathPayment({
    sendAsset: Asset.native(),
    sendMax: tradeAmount,
    destination: coldWallet.publicKey,
    destAsset: new Asset('USDC', USDC_ISSUER),
    destMin: minReceive,
    path: [
      Asset.native(),
      new Asset('USDC', USDC_ISSUER)
    ]
  }))
  .build();

await server.submitTransaction(tradeTx);
```

---

## Testing Against Stellar Testnet

### Setup Testnet Accounts

```bash
# Install Stellar CLI
npm install -g @stellar/stellar-sdk

# Fund accounts from testnet faucet
# Go to: https://laboratory.stellar.org/account-creator
# Or use:
curl "https://friendbot.stellar.org?addr=GXXXXXXXXX"

# Export keypairs for testing
export HOT_WALLET_SECRET="S..."
export COLD_WALLET_SECRET="S..."
export TEST_CLINIC_SECRET="S..."
```

### Integration Test Example

```typescript
// tests/stellar-service.integration.test.ts
import { Server, Networks, TransactionBuilder } from '@stellar/stellar-sdk';

describe('Stellar Service - Testnet Integration', () => {
  let server: Server;
  
  beforeAll(() => {
    // Point to Stellar testnet
    server = new Server('https://horizon-testnet.stellar.org');
  });

  it('should submit payment from hot to clinic wallet', async () => {
    const hotAccount = await server.loadAccount(hotWalletPublicKey);
    
    const tx = new TransactionBuilder(hotAccount)
      .addOperation(Operation.payment({
        destination: clinicWalletPublicKey,
        asset: Asset.native(),
        amount: '100.00'
      }))
      .setNetworkPassphrase(Networks.TESTNET_NETWORK_PASSPHRASE)
      .setTimeout(300)
      .build();

    tx.sign(hotWalletKeypair);
    
    const response = await server.submitTransaction(tx);
    expect(response.successful).toBe(true);
    expect(response.hash).toMatch(/[a-f0-9]{64}/);
  });

  it('should verify payment on blockchain', async () => {
    const txn = await server.transactions()
      .forAccount(clinicWalletPublicKey)
      .limit(1)
      .call();

    expect(txn.records).toHaveLength(1);
    expect(txn.records[0].type_i).toBe(1);  // Payment operation
  });
});
```

### Local Testing with Docker

```bash
# Start local Stellar test server (stellar-core + horizon)
docker-compose up -d stellar-testnet

# Point SDK to local server
const server = new Server('http://localhost:8000');

# Create test accounts
curl http://localhost:8000/friendbot?addr=GXXXXXXXXX

# Test payment flow
npm run test:stellar:local
```

---

## Monitoring & Alerting

### Key Metrics

- **Payment Processing Latency**: Time from request to settlement batch
  - Target: < 5 minutes
  - Alert: > 10 minutes

- **Hot Wallet Balance**: Monitor to prevent insufficient funds
  - Target: $5k-$10k
  - Alert: < $2k or > $15k

- **Cold Wallet Multisig Delays**: Time to collect signatures
  - Target: < 30 minutes
  - Alert: > 1 hour pending

- **DEX Slippage**: Difference between quoted and actual rates
  - Target: < 0.5%
  - Alert: > 1%

### Logs

All Stellar operations logged to stdout + MongoDB:

```typescript
// Example: Payment submitted
{
  timestamp: "2026-10-18T12:34:56Z",
  event: "payment_submitted",
  paymentId: "pay_123",
  clinic: "clinic_456",
  amount: "50.00",
  txHash: "abc123...",
  status: "pending_confirmation"
}
```

---

## Troubleshooting

### Issue: "Insufficient balance" error
- **Cause**: Hot wallet balance too low
- **Fix**: Trigger batch settlement immediately
- **Prevention**: Monitor hot wallet balance, auto-rebalance if < $2k

### Issue: "Transaction failed - bad auth"
- **Cause**: Signer key rotated but old key still in TX
- **Fix**: Regenerate transaction with current key
- **Prevention**: Validate key rotation 24h before deployment

### Issue: "Multisig quorum not met"
- **Cause**: Not enough custodian signatures on cold wallet TX
- **Fix**: Collect remaining signatures (3-of-5 required)
- **Prevention**: Monitor custodian response times, escalate > 1 hour

---

## Security Considerations

1. **Key Storage**
   - Hot wallet keys: K8s secrets, rotated monthly
   - Cold wallet keys: Offline, HSM-protected, multi-custodian

2. **Rate Limiting**
   - API: 100 requests/minute per clinic
   - Stellar: 1 submission/second per account

3. **HIPAA Compliance**
   - All payment amounts PHI (Protected Health Information)
   - Logs encrypted at rest
   - Audit trail immutable via blockchain

---

## References

- [Stellar Documentation](https://developers.stellar.org/)
- [Stellar SDK (JS)](https://github.com/stellar/js-stellar-sdk)
- [Testnet Friendbot](https://laboratory.stellar.org/account-creator)
- [Health Watchers Architecture](./ARCHITECTURE.md)

---

**Issue #1575**: Created comprehensive Stellar integration guide covering architecture, payment flows, DEX integration, testing, monitoring, and troubleshooting.
