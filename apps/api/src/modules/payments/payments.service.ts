import crypto from 'crypto';
import { config } from '@health-watchers/config';
import { PaymentRecordModel } from './models/payment-record.model';

export interface PaymentIntent {
  intentId: string;
  clinicId: string;
  amount: string;
  destination: string;
  memo: string;
  network: string;
}

export const createPaymentIntent = async (clinicId: string, amount: string): Promise<PaymentIntent> => {
  const intentId = crypto.randomUUID();
  const intent: PaymentIntent = {
    intentId,
    clinicId,
    amount,
    destination: config.stellar.platformPublicKey,
    memo: `hw-${intentId.slice(0, 8)}`,
    network: config.stellar.network,
  };

  await PaymentRecordModel.create({ ...intent, status: 'pending' });
  return intent;
};
