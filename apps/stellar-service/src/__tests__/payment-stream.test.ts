import { paymentStreamEvents, registerPaymentConfirmationListener } from '../payment-stream';

describe('payment stream listener', () => {
  afterEach(() => {
    paymentStreamEvents.removeAllListeners('payment:confirmed');
  });

  it('emits payment confirmations for API consumers', (done) => {
    registerPaymentConfirmationListener((payment) => {
      expect(payment.memo).toBe('intent_abc123');
      expect(payment.amount).toBe('50.00');
      expect(payment.transactionHash).toBe('hash_xyz');
      done();
    });

    paymentStreamEvents.emit('payment:confirmed', {
      memo: 'intent_abc123',
      amount: '50.00',
      transactionHash: 'hash_xyz',
      from: 'GSENDER',
      confirmedAt: new Date(),
    });
  });
});
