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
          // Reset reconnect counter only after the stream successfully delivers a message
          reconnectAttempts = 0;
          stellarStreamHealth.set(1);

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
          if (closeHandle) {
            try { closeHandle(); } catch { /* ignore */ }
            closeHandle = undefined;
          }
          scheduleReconnect();
        },
      }) as () => void;

    // Mark stream healthy as soon as the SSE connection is established
    stellarStreamHealth.set(1);
  };

  const scheduleReconnect = () => {
    if (stopped) return;

    if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      logger.error({ reconnectAttempts }, 'Payment stream reconnect limit reached — giving up');
      return;
    }

    reconnectAttempts += 1;
    const delay = RECONNECT_DELAY_MS * Math.pow(2, Math.min(reconnectAttempts - 1, 5));
    logger.info({ attempt: reconnectAttempts, delayMs: delay }, 'Scheduling payment stream reconnect');
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

/**
 * Notify the API about a confirmed Stellar payment.
 * POSTs to /webhooks/stellar using the shared secret for authentication.
 * Retries up to 3 times with a 1-second delay on failure.
 */
export async function notifyApiOfPayment(payment: {
  memo: string;
  amount: string;
  transactionHash: string;
  from: string;
  confirmedAt: Date;
}): Promise<void> {
  const apiUrl = stellarConfig.apiUrl;
  const secret = stellarConfig.sharedSecret;

  if (!apiUrl) {
    logger.warn('API_URL not configured — skipping payment:confirmed notification');
    return;
  }

  const body = JSON.stringify({
    memo: payment.memo,
    txHash: payment.transactionHash,
    amount: payment.amount,
    from: payment.from,
  });

  const maxAttempts = 3;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await fetch(`${apiUrl}/webhooks/stellar`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(secret ? { Authorization: `Bearer ${secret}` } : {}),
        },
        body,
        signal: AbortSignal.timeout(10_000),
      });

      if (!response.ok) {
        const text = await response.text().catch(() => '');
        logger.warn(
          { memo: payment.memo, txHash: payment.transactionHash, status: response.status, body: text, attempt },
          'API payment notification returned non-2xx'
        );
        // Don't retry 4xx — they are permanent errors (e.g. no matching intent)
        if (response.status >= 400 && response.status < 500) return;
      } else {
        logger.info(
          { memo: payment.memo, txHash: payment.transactionHash },
          'API notified of confirmed payment'
        );
        return;
      }
    } catch (err) {
      logger.error(
        { err, memo: payment.memo, txHash: payment.transactionHash, attempt },
        'Failed to notify API of confirmed payment'
      );
    }

    if (attempt < maxAttempts) {
      await new Promise((r) => setTimeout(r, 1_000 * attempt));
    }
  }

  logger.error(
    { memo: payment.memo, txHash: payment.transactionHash },
    'Exhausted retries notifying API of payment — payment may need manual confirmation'
  );
}
