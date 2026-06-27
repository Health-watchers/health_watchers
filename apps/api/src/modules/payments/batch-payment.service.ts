import { v4 as uuidv4 } from 'uuid';
import { BatchPaymentModel, IBatchPayment, PaymentInstruction } from './models/batch-payment.model';
import { PaymentRecordModel } from './models/payment-record.model';
import { CreateBatchPaymentInput } from './batch-payment.validation';
import { auditLog } from '../audit/audit.service';

export interface RequestUser {
  _id: string;
  clinicId: string;
}

export class BatchPaymentService {
  async createBatch(input: CreateBatchPaymentInput, user: RequestUser): Promise<IBatchPayment> {
    // Validate no duplicate destinations
    const destinations = new Set(input.payments.map((p) => p.destination));
    if (destinations.size !== input.payments.length) {
      throw new Error('Duplicate destination addresses found in batch');
    }

    // Calculate total amount
    const totalAmount = input.payments.reduce((sum, p) => sum + parseFloat(p.amount), 0).toString();

    // Create batch payment record
    const batchId = uuidv4();
    const batch = await BatchPaymentModel.create({
      batchId,
      clinicId: user.clinicId,
      createdBy: user._id,
      payments: input.payments,
      status: 'pending',
      currency: input.currency,
      totalAmount,
    });

    // Audit log
    await auditLog({
      userId: user._id,
      clinicId: user.clinicId,
      action: 'BATCH_PAYMENT_CREATED',
      resourceType: 'BatchPayment',
      resourceId: batch._id.toString(),
      outcome: 'SUCCESS',
      metadata: {
        batchId,
        paymentCount: input.payments.length,
        totalAmount,
        currency: input.currency,
      },
    });

    return batch;
  }

  async getBatch(batchId: string, clinicId: string): Promise<IBatchPayment | null> {
    return BatchPaymentModel.findOne({ batchId, clinicId });
  }

  async updateBatchStatus(
    batchId: string,
    status: 'submitted' | 'confirmed' | 'failed',
    txHash?: string,
    failureReason?: string
  ): Promise<IBatchPayment | null> {
    const update: Record<string, unknown> = { status };

    if (status === 'submitted' && txHash) {
      update.txHash = txHash;
      update.submittedAt = new Date();
    } else if (status === 'confirmed' && txHash) {
      update.txHash = txHash;
      update.confirmedAt = new Date();
    } else if (status === 'failed' && failureReason) {
      update.failureReason = failureReason;
    }

    return BatchPaymentModel.findOneAndUpdate({ batchId }, update, { new: true });
  }

  async createPaymentRecordsFromBatch(batch: IBatchPayment): Promise<void> {
    if (batch.status !== 'confirmed' || !batch.txHash) {
      throw new Error('Batch must be confirmed with a transaction hash');
    }

    const paymentRecords = batch.payments.map((payment) => ({
      clinicId: batch.clinicId,
      destination: payment.destination,
      amount: payment.amount,
      currency: batch.currency,
      status: 'confirmed',
      txHash: batch.txHash,
      confirmedAt: batch.confirmedAt,
      batchId: batch._id,
      memo: payment.memo,
    }));

    await PaymentRecordModel.insertMany(paymentRecords);
  }
}

export const batchPaymentService = new BatchPaymentService();
