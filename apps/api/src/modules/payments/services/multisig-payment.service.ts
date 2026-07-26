import { Types } from 'mongoose';
import logger from '@api/utils/logger';

export interface MultiSigPaymentRequest {
  paymentId: Types.ObjectId;
  clinicId: Types.ObjectId;
  amount: number;
  currency: string;
  requiredSignatures: number;
  signers: string[]; // Stellar public keys
  description?: string;
}

export interface PaymentSignature {
  paymentId: Types.ObjectId;
  signer: string;
  signature: string;
  signedAt: Date;
}

export class MultiSigPaymentService {
  /**
   * Create a multi-signature payment request
   * Requires multiple signers to approve before transaction is submitted
   */
  async createMultiSigPaymentRequest(request: MultiSigPaymentRequest): Promise<any> {
    const { PaymentRecordModel } = await import('../models/payment-record.model');
    const { MultiSigPaymentModel } = await import('../models/multisig-payment.model');

    // Validate required signatures
    if (request.requiredSignatures < 2 || request.requiredSignatures > request.signers.length) {
      throw new Error('requiredSignatures must be between 2 and number of signers');
    }

    // Create payment record
    const payment = await PaymentRecordModel.create({
      clinicId: request.clinicId,
      amount: request.amount,
      currency: request.currency,
      status: 'pending_signatures',
      description: request.description,
      metadata: {
        multiSig: true,
        requiredSignatures: request.requiredSignatures,
        signers: request.signers,
      },
    });

    // Create multi-sig payment record
    const multiSigPayment = await MultiSigPaymentModel.create({
      paymentId: payment._id,
      clinicId: request.clinicId,
      amount: request.amount,
      currency: request.currency,
      requiredSignatures: request.requiredSignatures,
      signers: request.signers,
      signatures: [],
      status: 'pending',
    });

    logger.info(
      { paymentId: payment._id, requiredSignatures: request.requiredSignatures },
      'Multi-sig payment request created'
    );

    return { payment, multiSigPayment };
  }

  /**
   * Add a signature to a multi-sig payment
   */
  async addSignature(paymentId: string, signer: string, signature: string): Promise<any> {
    const { MultiSigPaymentModel } = await import('../models/multisig-payment.model');

    const multiSigPayment = await MultiSigPaymentModel.findOne({ paymentId });
    if (!multiSigPayment) {
      throw new Error('Multi-sig payment not found');
    }

    // Check if signer is authorized
    if (!multiSigPayment.signers.includes(signer)) {
      throw new Error('Signer is not authorized for this payment');
    }

    // Check if already signed
    if (multiSigPayment.signatures.some((s: any) => s.signer === signer)) {
      throw new Error('Signer has already signed this payment');
    }

    // Add signature
    multiSigPayment.signatures.push({
      signer,
      signature,
      signedAt: new Date(),
    });

    await multiSigPayment.save();

    logger.info(
      { paymentId, signer, signatureCount: multiSigPayment.signatures.length },
      'Signature added to multi-sig payment'
    );

    // Check if all required signatures are collected
    if (multiSigPayment.signatures.length >= multiSigPayment.requiredSignatures) {
      await this.markReadyForSubmission(paymentId);
    }

    return multiSigPayment;
  }

  /**
   * Mark payment as ready for submission once all signatures are collected
   */
  private async markReadyForSubmission(paymentId: string): Promise<void> {
    const { MultiSigPaymentModel } = await import('../models/multisig-payment.model');
    const { PaymentRecordModel } = await import('../models/payment-record.model');

    await MultiSigPaymentModel.findOneAndUpdate({ paymentId }, { status: 'ready_for_submission' });

    await PaymentRecordModel.findByIdAndUpdate(paymentId, {
      status: 'ready_for_submission',
    });

    logger.info({ paymentId }, 'Multi-sig payment ready for submission');
  }

  /**
   * Get multi-sig payment details
   */
  async getMultiSigPayment(paymentId: string): Promise<any> {
    const { MultiSigPaymentModel } = await import('../models/multisig-payment.model');

    const multiSigPayment = await MultiSigPaymentModel.findOne({ paymentId });
    if (!multiSigPayment) {
      throw new Error('Multi-sig payment not found');
    }

    return {
      ...multiSigPayment.toObject(),
      signatureProgress: {
        collected: multiSigPayment.signatures.length,
        required: multiSigPayment.requiredSignatures,
        complete: multiSigPayment.signatures.length >= multiSigPayment.requiredSignatures,
      },
    };
  }

  /**
   * List pending multi-sig payments for a signer
   */
  async getPendingPaymentsForSigner(signer: string): Promise<any[]> {
    const { MultiSigPaymentModel } = await import('../models/multisig-payment.model');

    return MultiSigPaymentModel.find({
      signers: signer,
      status: { $in: ['pending', 'ready_for_submission'] },
    })
      .sort({ createdAt: -1 })
      .lean();
  }
}

export const multiSigPaymentService = new MultiSigPaymentService();
