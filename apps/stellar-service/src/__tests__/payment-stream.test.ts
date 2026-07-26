// Mocks must be defined before module imports

jest.mock('../logger.js', () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

jest.mock('prom-client', () => {
  const inc = jest.fn();
  const set = jest.fn();
  const observe = jest.fn();
  const metrics = jest.fn().mockResolvedValue('metrics-output');
  const Registry = jest.fn().mockImplementation(() => ({ metrics, contentType: 'text/plain' }));
  const Counter = jest.fn().mockImplementation(() => ({ inc }));
  const Gauge = jest.fn().mockImplementation(() => ({ set }));
  const Histogram = jest.fn().mockImplementation(() => ({ observe }));
  const collectDefaultMetrics = jest.fn();
  return { __esModule: true, default: { Registry, Counter, Gauge, Histogram, collectDefaultMetrics } };
});

// Config mock — values are mutated in tests to simulate different environments
const mockConfig = {
  platformPublicKey: 'GPLATFORMKEY1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ123456',
  network: 'testnet',
  horizonUrl: 'https://horizon-testnet.stellar.org',
  apiUrl: 'http://localhost:3000',
  sharedSecret: 'test-secret',
};

jest.mock('../config.js', () => ({
  __esModule: true,
  stellarConfig: mockConfig,
}));

// Capture the SSE stream callbacks so we can trigger them in tests
type StreamCallbacks = { onmessage: (record: any) => void; onerror: (err: any) => void };
let capturedCallbacks: StreamCallbacks | null = null;
const mockStreamClose = jest.fn();

jest.mock('@stellar/stellar-sdk', () => ({
  __esModule: true,
  Horizon: {
    Server: jest.fn().mockImplementation(() => ({
      payments: () => ({
        forAccount: () => ({
          cursor: () => ({
            stream: (callbacks: StreamCallbacks) => {
              capturedCallbacks = callbacks;
              return mockStreamClose;
            },
          }),
        }),
      }),
    })),
  },
}));

// Mock global fetch for notifyApiOfPayment
const mockFetch = jest.fn() as jest.Mock;
global.fetch = mockFetch;

// Imports after mocks
import {
  startPaymentStream,
  registerPaymentConfirmationListener,
  notifyApiOfPayment,
  paymentStreamEvents,
} from '../payment-stream';

import { stellarConfirmedPaymentsTotal, stellarStreamHealth } from '../metrics';

// Helpers

type PaymentStreamHandler = (payment: {
  memo: string;
  txHash: string;
  amount: string;
  from: string;
}) => void;

function makePaymentRecord(overrides: {
  type?: string;
  to?: string;
  from?: string;
  amount?: string;
  transaction_hash?: string;
  memo?: string;
} = {}) {
  const memo = overrides.memo ?? 'HW:ABCD1234';
  return {
    type: overrides.type ?? 'payment',
    to: overrides.to ?? mockConfig.platformPublicKey,
    from: overrides.from ?? 'GSENDER00000000000000000000000000000000000000000000000001',
    amount: overrides.amount ?? '10.0000000',
    transaction_hash: overrides.transaction_hash ?? 'abc123txhash',
    transaction: jest.fn().mockResolvedValue({ memo }),
  };
}

// Tests

describe('payment-stream', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    capturedCallbacks = null;
    paymentStreamEvents.removeAllListeners('payment:confirmed');
  });

  describe('startPaymentStream()', () => {
    it('starts the Horizon SSE stream and returns a close function', () => {
      const stop = startPaymentStream(jest.fn());
      expect(capturedCallbacks).not.toBeNull();
      expect(typeof stop).toBe('function');
    });

    it('does nothing if platformPublicKey is not set', () => {
      const original = mockConfig.platformPublicKey;
      mockConfig.platformPublicKey = '';
      startPaymentStream(jest.fn());
      expect(capturedCallbacks).toBeNull();
      mockConfig.platformPublicKey = original;
    });

    it('calls onPayment and emits payment:confirmed for a valid incoming payment', async () => {
      const handler = jest.fn() as jest.Mock;
      startPaymentStream(handler as PaymentStreamHandler);

      const confirmed = new Promise<any>((resolve) => {
        paymentStreamEvents.once('payment:confirmed', resolve);
      });

      const record = makePaymentRecord({ memo: 'HW:ABCD1234' });
      await capturedCallbacks!.onmessage(record);

      expect(handler).toHaveBeenCalledWith({
        memo: 'HW:ABCD1234',
        txHash: 'abc123txhash',
        amount: '10.0000000',
        from: record.from,
      });

      const event = await confirmed;
      expect(event.memo).toBe('HW:ABCD1234');
      expect(event.transactionHash).toBe('abc123txhash');
      expect(event.amount).toBe('10.0000000');
      expect(event.confirmedAt).toBeInstanceOf(Date);
    });

    it('increments stellarConfirmedPaymentsTotal on valid payment', async () => {
      startPaymentStream(jest.fn());
      await capturedCallbacks!.onmessage(makePaymentRecord());
      expect((stellarConfirmedPaymentsTotal as any).inc).toHaveBeenCalled();
    });

    it('ignores payments sent to a different destination', async () => {
      const handler = jest.fn() as jest.Mock;
      startPaymentStream(handler as PaymentStreamHandler);

      await capturedCallbacks!.onmessage(
        makePaymentRecord({ to: 'GDIFFERENT00000000000000000000000000000000000000000001' })
      );

      expect(handler).not.toHaveBeenCalled();
    });

    it('ignores non-payment operation types', async () => {
      const handler = jest.fn() as jest.Mock;
      startPaymentStream(handler as PaymentStreamHandler);

      await capturedCallbacks!.onmessage(makePaymentRecord({ type: 'create_account' }));

      expect(handler).not.toHaveBeenCalled();
    });

    it('ignores payments with no memo', async () => {
      const handler = jest.fn() as jest.Mock;
      startPaymentStream(handler as PaymentStreamHandler);

      await capturedCallbacks!.onmessage(makePaymentRecord({ memo: '' }));

      expect(handler).not.toHaveBeenCalled();
    });

    it('handles transaction fetch failure gracefully', async () => {
      const handler = jest.fn() as jest.Mock;
      startPaymentStream(handler as PaymentStreamHandler);

      const record = makePaymentRecord();
      (record.transaction as jest.Mock).mockRejectedValueOnce(new Error('Horizon timeout'));

      await capturedCallbacks!.onmessage(record);

      expect(handler).not.toHaveBeenCalled();
    });

    it('sets stellarStreamHealth to 0 on stream error', () => {
      startPaymentStream(jest.fn());
      capturedCallbacks!.onerror(new Error('SSE error'));
      expect((stellarStreamHealth as any).set).toHaveBeenCalledWith(0);
    });

    it('close() sets stream health to 0', () => {
      const stop = startPaymentStream(jest.fn());
      stop();
      expect((stellarStreamHealth as any).set).toHaveBeenCalledWith(0);
    });
  });

  describe('registerPaymentConfirmationListener()', () => {
    it('receives emitted payment:confirmed events', (done: jest.DoneCallback) => {
      registerPaymentConfirmationListener((payment) => {
        expect(payment.memo).toBe('HW:TESTMEMO');
        expect(payment.transactionHash).toBe('txhash999');
        expect(payment.amount).toBe('50.00');
        expect(payment.from).toBe('GSENDER');
        expect(payment.confirmedAt).toBeInstanceOf(Date);
        done();
      });

      paymentStreamEvents.emit('payment:confirmed', {
        memo: 'HW:TESTMEMO',
        transactionHash: 'txhash999',
        amount: '50.00',
        from: 'GSENDER',
        confirmedAt: new Date(),
      });
    });

    it('can register multiple listeners', () => {
      const listenerA = jest.fn();
      const listenerB = jest.fn();

      registerPaymentConfirmationListener(listenerA as any);
      registerPaymentConfirmationListener(listenerB as any);

      paymentStreamEvents.emit('payment:confirmed', {
        memo: 'HW:MULTI',
        transactionHash: 'tx1',
        amount: '5.00',
        from: 'G1',
        confirmedAt: new Date(),
      });

      expect(listenerA).toHaveBeenCalledTimes(1);
      expect(listenerB).toHaveBeenCalledTimes(1);
    });
  });

  describe('notifyApiOfPayment()', () => {
    const payment = {
      memo: 'HW:ABCD1234',
      amount: '10.00',
      transactionHash: 'txhash001',
      from: 'GSENDER',
      confirmedAt: new Date(),
    };

    it('POSTs to /webhooks/stellar with the correct payload and auth header', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });

      await notifyApiOfPayment(payment);

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toBe('http://localhost:3000/webhooks/stellar');
      expect((options.headers as Record<string, string>).Authorization).toBe('Bearer test-secret');
      const body = JSON.parse(options.body as string);
      expect(body.memo).toBe('HW:ABCD1234');
      expect(body.txHash).toBe('txhash001');
      expect(body.amount).toBe('10.00');
    });

    it('retries on network failure and succeeds on second attempt', async () => {
      mockFetch
        .mockRejectedValueOnce(new Error('network error'))
        .mockResolvedValueOnce({ ok: true, status: 200 });

      await notifyApiOfPayment(payment);

      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('does NOT retry on 4xx response (permanent error)', async () => {
      mockFetch.mockResolvedValue({ ok: false, status: 404, text: async () => 'not found' });

      await notifyApiOfPayment(payment);

      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('retries on 5xx and exhausts all attempts', async () => {
      mockFetch.mockResolvedValue({ ok: false, status: 503, text: async () => 'unavailable' });

      await notifyApiOfPayment(payment);

      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it('does nothing if apiUrl is not configured', async () => {
      const originalUrl = mockConfig.apiUrl;
      mockConfig.apiUrl = '';
      await notifyApiOfPayment(payment);
      expect(mockFetch).not.toHaveBeenCalled();
      mockConfig.apiUrl = originalUrl;
    });
  });

  describe('end-to-end: stream → API notification', () => {
    it('calls the API when a valid payment arrives on the stream', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });

      startPaymentStream((p) => {
        expect(p.memo).toBe('HW:E2ETEST1');
      });
      registerPaymentConfirmationListener(notifyApiOfPayment);

      const record = makePaymentRecord({ memo: 'HW:E2ETEST1', transaction_hash: 'e2etxhash' });
      await capturedCallbacks!.onmessage(record);

      // Allow the async listener to settle
      await new Promise((r) => setImmediate(r));

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const body = JSON.parse((mockFetch.mock.calls[0] as [string, RequestInit])[1].body as string);
      expect(body.memo).toBe('HW:E2ETEST1');
      expect(body.txHash).toBe('e2etxhash');
    });
  });
});
