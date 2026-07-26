# Stellar Integration Guide

Health Watchers uses Stellar blockchain for secure, transparent payment processing.

## Overview

Stellar provides:
- **Low-cost transactions**: Minimal fees for healthcare payments
- **Fast settlement**: Transactions settle in 3-5 seconds
- **Multi-currency support**: XLM and USDC stablecoins
- **Transparency**: All transactions recorded on immutable ledger

## Payment Flow

```
Patient                 API                 Stellar Network
   │                    │                        │
   ├─ Initiate Payment ─>│                        │
   │                    ├─ Create Intent ────────>│
   │                    │                        │
   │                    │<─ Transaction Hash ────┤
   │                    │                        │
   │<─ Payment Request ─┤                        │
   │                    │                        │
   ├─ Approve & Sign ──>│                        │
   │                    ├─ Submit Transaction ──>│
   │                    │                        │
   │                    │<─ Confirmation ────────┤
   │                    │                        │
   │<─ Confirmation ────┤                        │
   │                    │                        │
```

## Wallet Setup

### For Clinics

1. **Generate Keypair**
   ```bash
   npm run generate-keypair --workspace=api
   ```

2. **Fund Account**
   - Testnet: Use [Stellar Friendbot](https://developers.stellar.org/docs/tutorials/create-account)
   - Mainnet: Purchase XLM from exchange

3. **Store Keypair Securely**
   - Use AWS Secrets Manager or similar
   - Never commit to version control

### For Patients

- Patients can use existing Stellar wallets
- Or create new wallet via Health Watchers portal
- Wallet address stored encrypted in database

## Recurring Billing

Health Watchers implements recurring payments on top of Stellar:

```
Daily Scheduler
    │
    ├─ Find due payments
    ├─ Create payment intents
    ├─ Notify patients
    ├─ Wait for approval
    ├─ Submit to Stellar
    └─ Update next payment date
```

See [Recurring Billing](./recurring-billing.md) for details.

## Testnet Guide

### Setup

1. **Set Environment**
   ```bash
   STELLAR_NETWORK=testnet
   STELLAR_HORIZON_URL=https://horizon-testnet.stellar.org
   ```

2. **Create Test Account**
   ```bash
   curl "https://friendbot.stellar.org?addr=YOUR_PUBLIC_KEY"
   ```

3. **Fund with Test XLM**
   - Friendbot provides 10,000 XLM
   - Sufficient for testing

### Testing Payments

```bash
# Create payment intent
curl -X POST http://localhost:3001/api/v1/payments/intent \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "patientId": "...",
    "amount": "100",
    "currency": "XLM"
  }'

# Approve payment
curl -X POST http://localhost:3001/api/v1/payments/approve \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "intentId": "...",
    "transactionHash": "..."
  }'
```

## Mainnet Deployment

### Prerequisites

- Production Stellar account with sufficient XLM
- Secure key management (AWS Secrets Manager, HashiCorp Vault)
- Compliance review for financial transactions

### Configuration

```bash
STELLAR_NETWORK=public
STELLAR_HORIZON_URL=https://horizon.stellar.org
STELLAR_CLINIC_PUBLIC_KEY=your_public_key
STELLAR_CLINIC_SECRET_KEY=your_secret_key  # Store in secrets manager
```

### Testing Before Go-Live

1. Run full load test on testnet
2. Verify all payment flows
3. Test error handling and retries
4. Audit transaction logs

## Error Handling

Common errors and recovery:

| Error | Cause | Recovery |
|-------|-------|----------|
| Insufficient Balance | Account underfunded | Fund account |
| Invalid Destination | Bad wallet address | Verify address format |
| Transaction Failed | Network issue | Retry with exponential backoff |
| Timeout | Slow network | Increase timeout threshold |

## Monitoring

Monitor Stellar transactions:

```bash
# View transaction history
curl https://horizon.stellar.org/accounts/YOUR_PUBLIC_KEY/transactions

# Check account balance
curl https://horizon.stellar.org/accounts/YOUR_PUBLIC_KEY
```

## See Also

- [Recurring Billing](./recurring-billing.md)
- [Payment Flow](./payment-flow.md)
- [Wallet Setup](./wallet-setup.md)
- [Stellar Documentation](https://developers.stellar.org/)
