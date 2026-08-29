/**
 * Payment-domain utility helpers.
 * Extracted from PaymentTable and related components to avoid duplication
 * and make the logic independently testable.
 */

export type PaymentStatus = 'pending' | 'confirmed' | 'completed' | 'failed' | string;

export type BadgeVariant = 'warning' | 'success' | 'danger' | 'default';

/**
 * Maps a payment status string to a Badge variant.
 */
export function paymentStatusVariant(status: PaymentStatus): BadgeVariant {
  switch (status) {
    case 'pending':
      return 'warning';
    case 'confirmed':
    case 'completed':
      return 'success';
    case 'failed':
      return 'danger';
    default:
      return 'default';
  }
}

/**
 * Returns true when the payment has enough information to generate a receipt.
 */
export function canShowReceipt(payment: { intentId?: string; txHash?: string }): boolean {
  return Boolean(payment.intentId || payment.txHash);
}

/**
 * Returns true when a dispute can be filed against this payment.
 * Disputes are only allowed on non-pending payments.
 */
export function canFileDispute(status: PaymentStatus): boolean {
  return status !== 'pending';
}

// ── Stellar ───────────────────────────────────────────────────────────────────

/**
 * Builds a Stellar Expert explorer URL for a transaction or account.
 *
 * @param value  - transaction hash or account address
 * @param type   - 'tx' | 'account'
 * @param network - 'mainnet' | 'testnet'
 */
export function getStellarExplorerUrl(
  value: string,
  type: 'tx' | 'account' = 'tx',
  network: string = 'testnet'
): string {
  const net = network === 'mainnet' ? 'public' : 'testnet';
  return `https://stellar.expert/explorer/${net}/${type}/${value}`;
}
