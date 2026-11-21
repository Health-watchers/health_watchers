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

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function crc16Xmodem(bytes: Uint8Array): number {
  let crc = 0x0000;
  for (const byte of bytes) {
    crc ^= byte << 8;
    for (let i = 0; i < 8; i++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc;
}

/**
 * Validates a Stellar account public key (G…) including its StrKey version
 * byte and CRC16 checksum, so typos are caught before anything is submitted.
 */
export function isValidStellarPublicKey(address: string): boolean {
  if (!/^G[A-Z2-7]{55}$/.test(address)) return false;

  const bytes = new Uint8Array(35);
  let bits = 0;
  let value = 0;
  let index = 0;
  for (const char of address) {
    value = (value << 5) | BASE32_ALPHABET.indexOf(char);
    bits += 5;
    if (bits >= 8) {
      bytes[index++] = (value >>> (bits - 8)) & 0xff;
      bits -= 8;
    }
  }
  if (index !== 35) return false;

  const versionByte = 6 << 3; // ed25519 public key
  if (bytes[0] !== versionByte) return false;

  const payload = bytes.subarray(0, 33);
  const checksum = bytes[33] | (bytes[34] << 8); // little-endian
  return crc16Xmodem(payload) === checksum;
}

// ── DEX ───────────────────────────────────────────────────────────────────────

/**
 * A DEX conversion quote obtained from Stellar Horizon's `/paths` API.
 * Amounts are decimal strings as returned by Horizon (e.g. "12.5000000").
 */
export interface DexQuote {
  /** Asset the patient pays with (e.g. local currency token). */
  sourceAsset: string;
  /** Asset the payment settles in (e.g. XLM). */
  destinationAsset: string;
  /** Amount of `sourceAsset` to be spent. */
  sourceAmount: string;
  /** Amount of `destinationAsset` expected to be received. */
  destinationAmount: string;
  /** Exchange rate: destination units per one source unit. */
  rate: number;
  /** DEX conversion fee, denominated in the destination asset. */
  dexFee: string;
  /** ISO timestamp after which the quote should no longer be used. */
  expiresAt: string;
}

/**
 * Returns true when the current rate is within `tolerancePercent` of the
 * quoted rate. Used as slippage protection before submitting a path payment.
 *
 * @param quotedRate       - rate at the time the quote was fetched
 * @param currentRate      - rate observed at submission time
 * @param tolerancePercent - maximum allowed deviation, in percent (e.g. 1.5)
 */
export function isWithinSlippageTolerance(
  quotedRate: number,
  currentRate: number,
  tolerancePercent: number
): boolean {
  if (!Number.isFinite(quotedRate) || !Number.isFinite(currentRate)) return false;
  if (quotedRate <= 0 || currentRate <= 0) return false;
  if (!Number.isFinite(tolerancePercent) || tolerancePercent < 0) return false;

  const deviationPercent = Math.abs((currentRate - quotedRate) / quotedRate) * 100;
  return deviationPercent <= tolerancePercent;
}

/**
 * Formats the DEX conversion fee for display in the payment breakdown.
 *
 * @param dexFee          - fee amount as a decimal string
 * @param destinationAsset - asset the fee is denominated in
 */
export function formatDexFee(dexFee: string, destinationAsset: string): string {
  const amount = Number(dexFee);
  if (!Number.isFinite(amount)) return `— ${destinationAsset}`;

  const formatted = amount.toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 7,
  });
  return `${formatted} ${destinationAsset}`;
}
