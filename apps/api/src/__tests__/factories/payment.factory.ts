import mongoose from 'mongoose';
import type { PaymentRecord } from '@api/modules/payments/models/payment-record.model';

let seq = 0;

function nextSeq() {
  return ++seq;
}

export function buildPayment(overrides: Partial<PaymentRecord> = {}): Partial<PaymentRecord> {
  const i = nextSeq();
  return {
    intentId: `intent-test-${i}-${Date.now()}`,
    amount: '100.00',
    destination: 'GDEST123456789ABCDEFGHIJKLMNOPQRS',
    status: 'pending',
    clinicId: new mongoose.Types.ObjectId().toString(),
    assetCode: 'XLM',
    paymentType: 'immediate',
    feeStrategy: 'standard',
    ...overrides,
  };
}

export function buildConfirmedPayment(overrides: Partial<PaymentRecord> = {}): Partial<PaymentRecord> {
  const i = nextSeq();
  return buildPayment({
    intentId: `intent-confirmed-${i}-${Date.now()}`,
    status: 'confirmed',
    txHash: `txhash-${i}-${Date.now()}`,
    confirmedAt: new Date(),
    ...overrides,
  });
}

export function buildFailedPayment(overrides: Partial<PaymentRecord> = {}): Partial<PaymentRecord> {
  const i = nextSeq();
  return buildPayment({
    intentId: `intent-failed-${i}-${Date.now()}`,
    status: 'failed',
    ...overrides,
  });
}

export function buildEscrowPayment(overrides: Partial<PaymentRecord> = {}): Partial<PaymentRecord> {
  const i = nextSeq();
  const now = new Date();
  return buildPayment({
    intentId: `intent-escrow-${i}-${Date.now()}`,
    paymentType: 'escrow',
    claimableBalanceId: `claimable-${i}`,
    claimableAfter: now,
    claimableUntil: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
    claimed: false,
    ...overrides,
  });
}

export function buildPaymentWithReceipt(overrides: Partial<PaymentRecord> = {}): Partial<PaymentRecord> {
  return buildConfirmedPayment({
    receiptNumber: `RCP-${Date.now()}`,
    receiptUrl: 'https://receipts.example.com/rcp-001.pdf',
    usdEquivalent: '100.00',
    exchangeRate: '1.00',
    receiptGeneratedAt: new Date(),
    ...overrides,
  });
}

export function buildPaymentBatch(count: number, overrides: Partial<PaymentRecord> = {}): Partial<PaymentRecord>[] {
  return Array.from({ length: count }, () => buildPayment(overrides));
}
