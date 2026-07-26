/**
 * Recorded Stellar testnet API responses for E2E test mocking.
 * These represent the shapes returned by the Next.js BFF routes
 * (which proxy to /api/v1/payments/*) so tests never hit the real Stellar network.
 */

export const MOCK_TX_HASH = 'a'.repeat(64);
export const MOCK_INTENT_ID = 'intent_mock_e2e_00000000000000000001';
export const MOCK_PUBLIC_KEY = 'GBZXN7PIRZGNMHGA7MUUUF4GWPY5AYPGZUUTNMSBPROJECTHEALTHWATCHER';
export const MOCK_CLAIMABLE_BALANCE_ID = 'cb_mock_claimable_balance_e2e_0001';

/** GET /api/payments/balance */
export const balanceResponse = {
  status: 'success',
  data: {
    publicKey: MOCK_PUBLIC_KEY,
    federationAddress: 'clinic1*healthwatchers.testnet',
    xlmBalance: '10000.0000000',
    usdcBalance: '0.0000000',
  },
};

/** POST /api/payments/fund (Friendbot) */
export const fundResponse = {
  status: 'success',
  data: { funded: true, balance: '10000.0000000' },
};

/** POST /api/payments/intent */
export const createIntentResponse = {
  status: 'success',
  data: {
    intentId: MOCK_INTENT_ID,
    amount: '50',
    assetCode: 'XLM',
    destination: MOCK_PUBLIC_KEY,
    status: 'pending',
    stellarAddress: MOCK_PUBLIC_KEY,
    createdAt: '2026-06-25T14:00:00.000Z',
  },
};

/** POST /api/v1/payments/:intentId/confirm */
export const confirmPaymentResponse = {
  status: 'success',
  data: {
    intentId: MOCK_INTENT_ID,
    transactionHash: MOCK_TX_HASH,
    status: 'confirmed',
    confirmedAt: '2026-06-25T14:01:00.000Z',
  },
};

/** Payment in failed state (insufficient funds / horizon error) */
export const failedPaymentResponse = {
  status: 'success',
  data: {
    intentId: MOCK_INTENT_ID,
    status: 'failed',
    error: 'op_underfunded',
    failedAt: '2026-06-25T14:01:30.000Z',
  },
};

/** POST /:intentId/dispute */
export const createDisputeResponse = {
  status: 'success',
  data: {
    _id: 'dispute_mock_0001',
    paymentIntentId: MOCK_INTENT_ID,
    reason: 'incorrect_amount',
    description: 'Incorrect amount charged',
    status: 'open',
    openedAt: '2026-06-25T14:02:00.000Z',
  },
};

/** PUT /disputes/:id/resolve */
export const resolveDisputeResponse = {
  status: 'success',
  data: {
    _id: 'dispute_mock_0001',
    status: 'resolved',
    resolution: 'refund_issued',
    resolvedAt: '2026-06-25T14:05:00.000Z',
  },
};

/** Refund response */
export const refundResponse = {
  status: 'success',
  data: {
    intentId: MOCK_INTENT_ID,
    status: 'refunded',
    refundTransactionHash: 'b'.repeat(64),
    refundedAt: '2026-06-25T14:03:00.000Z',
  },
};

/** POST /payments/claimable-balance/create */
export const createClaimableBalanceResponse = {
  success: true,
  data: {
    intentId: `escrow_${MOCK_CLAIMABLE_BALANCE_ID}`,
    claimableBalanceId: MOCK_CLAIMABLE_BALANCE_ID,
    amount: '100',
    claimableAfter: '2026-06-25T14:00:00.000Z',
    claimableUntil: '2026-07-25T14:00:00.000Z',
    status: 'pending',
  },
};

/** POST /payments/claimable-balance/claim */
export const claimClaimableBalanceResponse = {
  success: true,
  data: {
    claimableBalanceId: MOCK_CLAIMABLE_BALANCE_ID,
    status: 'claimed',
    claimTransactionHash: 'c'.repeat(64),
    claimedAt: '2026-06-25T14:04:00.000Z',
  },
};
