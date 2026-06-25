import { Horizon } from '@stellar/stellar-sdk';
import { EventEmitter } from 'events';
import { stellarConfig } from './config.js';
import logger from './logger.js';
import { stellarConfirmedPaymentsTotal, stellarStreamHealth } from './metrics.js';

export type PaymentStreamHandler = (payment: {
  memo: string;
  txHash: string;
  amount: string;
  from: string;
}) => void;

export const paymentStreamEvents = new EventEmitter();

const RECONNECT_DELAY_MS = 5_000;
const MAX_RECONNECT_ATTEMPTS = 10;

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

  const server = new Horizon.Server(stellarConfig.horizonUrl);
  let closeHandle: (() => void) | undefined;
  let reconnectAttempts = 0;
  let stopped = false;

  logger.info(
    { publicKey: stellarConfig.platformPublicKey, network: stellarConfig.network },
    'Listening for Stellar payments'
  );

  const connect = () => {
    if (stopped) return;
    stellarStreamHealth.set(0);
    closeHandle = server
      .payments()
      .forAccount(stellarConfig.platformPublicKey)
      .cursor('now')
      .stream({
        onmessage: async (record: any) => {
          const payment = await parseIncomingPayment(record);
          if (!payment) return;

          onPayment(payment);
          paymentStreamEvents.emit('payment:confirmed', {
            memo: payment.memo,
            amount: payment.amount,
            transactionHash: payment.txHash,
            from: payment.from,
            confirmedAt: new Date(),
          });
          stellarConfirmedPaymentsTotal.inc();
        },
        onerror: (err: any) => {
          stellarStreamHealth.set(0);
          logger.error({ err }, 'Payment stream error');
          scheduleReconnect();
        },
      }) as () => void;

    reconnectAttempts = 0;
    stellarStreamHealth.set(1);
  };

  const scheduleReconnect = () => {
    if (stopped || reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      logger.error({ reconnectAttempts }, 'Payment stream reconnect stopped');
      return;
    }

    reconnectAttempts += 1;
    const delay = RECONNECT_DELAY_MS * Math.pow(2, Math.min(reconnectAttempts - 1, 5));
    setTimeout(connect, delay);
  };

  const parseIncomingPayment = async (record: any) => {
    if (record.type !== 'payment' || record.to !== stellarConfig.platformPublicKey) return null;

    try {
      const tx = await record.transaction();
      const memo = tx.memo ?? '';
      if (!memo) return null;

      return {
        memo,
        txHash: record.transaction_hash,
        amount: record.amount,
        from: record.from,
      };
    } catch (err) {
      logger.error({ err }, 'Failed to fetch transaction for payment');
      return null;
    }
  };

  connect();

  return () => {
    stopped = true;
    stellarStreamHealth.set(0);
    if (closeHandle) {
      closeHandle();
    }
  };
}

export function registerPaymentConfirmationListener(
  onConfirmed: (data: {
    memo: string;
    amount: string;
    transactionHash: string;
    from: string;
    confirmedAt: Date;
  }) => Promise<void> | void
): void {
  paymentStreamEvents.on('payment:confirmed', onConfirmed);
}
        }
      },
      onerror: (err: any) => {
        logger.error({ err }, 'Payment stream error');
      },
    });

  return close as () => void;
}
