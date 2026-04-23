import StellarSdk from 'stellar-sdk';
import { stellarConfig } from './config';
import logger from './logger';

export type PaymentStreamHandler = (payment: {
  memo: string;
  txHash: string;
  amount: string;
  from: string;
}) => void;

/**
 * Streams incoming payments for the clinic's platform public key via Horizon.
 * Calls onPayment for each confirmed incoming payment.
 * Returns a close() function to stop the stream.
 */
export function startPaymentStream(onPayment: PaymentStreamHandler): () => void {
  if (!stellarConfig.platformPublicKey) {
    logger.warn('STELLAR_PLATFORM_PUBLIC_KEY not set — stream disabled');
    return () => {};
  }

  const server = new StellarSdk.Horizon.Server(
    stellarConfig.network === 'mainnet'
      ? 'https://horizon.stellar.org'
      : 'https://horizon-testnet.stellar.org'
  );

  logger.info(
    { publicKey: stellarConfig.platformPublicKey, network: stellarConfig.network },
    'Listening for Stellar payments'
  );

  const close = server
    .payments()
    .forAccount(stellarConfig.platformPublicKey)
    .cursor('now')
    .stream({
      onmessage: async (record: any) => {
        if (record.type !== 'payment' || record.to !== stellarConfig.platformPublicKey) return;

        try {
          const tx = await record.transaction();
          const memo = tx.memo ?? '';
          onPayment({
            memo,
            txHash: record.transaction_hash,
            amount: record.amount,
            from: record.from,
          });
        } catch (err) {
          logger.error({ err }, 'Failed to fetch transaction for payment');
        }
      },
      onerror: (err: unknown) => {
        logger.error({ err }, 'Payment stream error');
      },
    });

  return close as () => void;
}
