import { Router, Request, Response } from 'express';
import { config } from '@health-watchers/config';
import { PaymentRecordModel } from './models/payment-record.model';
import { authenticate } from '@api/middlewares/auth.middleware';
import { validateRequest } from '@api/middlewares/validate.middleware';
import { objectIdSchema } from '@api/middlewares/objectid.schema';
import { createPaymentIntentSchema, confirmPaymentSchema } from './payments.validation';
import { asyncHandler } from '@api/middlewares/async.handler';
import { createPaymentIntentSchema, listPaymentsQuerySchema, ListPaymentsQuery } from './payments.validation';
import { toPaymentResponse } from './payments.transformer';
import { AppRole } from '@api/types/express';
import { config } from '@health-watchers/config';
import { stellarClient } from './services/stellar-client';
import logger from '@api/utils/logger';

const router = Router();
router.use(authenticate);

// Roles permitted to view payment records
const PAYMENT_READ_ROLES: AppRole[] = ['SUPER_ADMIN', 'CLINIC_ADMIN'];

function canReadPayments(role: AppRole): boolean {
  return PAYMENT_READ_ROLES.includes(role);
}

// GET /payments — paginated list scoped to the authenticated clinic
router.get(
  '/',
  validateRequest({ query: listPaymentsQuerySchema }),
  asyncHandler(async (req: Request, res: Response) => {
    if (!canReadPayments(req.user!.role)) {
      return res.status(403).json({ error: 'Forbidden', message: 'Insufficient permissions to view payments' });
    }

    const { patientId, status, page, limit } = req.query as unknown as ListPaymentsQuery;

    const filter: Record<string, unknown> = { clinicId: req.user!.clinicId };
    if (patientId) filter.patientId = patientId;
    if (status)    filter.status    = status;

    const skip = (page - 1) * limit;
    const [payments, total] = await Promise.all([
      PaymentRecordModel.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      PaymentRecordModel.countDocuments(filter),
    ]);

    res.json({
      status: 'success',
      data: payments.map(toPaymentResponse),
      meta: { total, page, limit },
    });
  }),
);

router.post(
  '/intent',
  validateRequest({ body: createPaymentIntentSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const { intentId, amount, destination, memo, patientId } = req.body;
    const record = await PaymentRecordModel.create({
      intentId, amount, destination, memo,
      clinicId: req.user!.clinicId,
    const {
      intentId,
      amount,
      destination,
      memo,
      patientId,
      assetCode = 'XLM',
      issuer,
    } = req.body;

    const clinicId = req.user!.clinicId;

    const normalizedAsset = String(assetCode).toUpperCase().trim();

    // XLM is always supported natively; other assets must be in the allow-list
    if (normalizedAsset !== 'XLM' && !config.supportedAssets.includes(normalizedAsset)) {
      return res.status(400).json({
        error: 'UnsupportedAsset',
        message: `Asset '${normalizedAsset}' is not supported. Supported assets: ${config.supportedAssets.join(', ')}`,
      });
    }

    // Non-native assets require an issuer account
    if (normalizedAsset !== 'XLM' && !issuer) {
      return res.status(400).json({
        error: 'BadRequest',
        message: `An issuer address is required for non-native asset '${normalizedAsset}'`,
      });
    }

    const record = await PaymentRecordModel.create({
      intentId,
      amount,
      destination,
      memo,
      clinicId: clinicId,
      patientId,
      status: 'pending',
      assetCode: normalizedAsset,
      assetIssuer: normalizedAsset === 'XLM' ? null : issuer,
    });

    res.status(201).json({
      status: 'success',
      data: { ...toPaymentResponse(record), platformPublicKey: config.stellar.platformPublicKey },
    });
  }),
);

/**
 * POST /payments/confirm
 * Confirm a payment by verifying the on-chain transaction.
 *
 * Accepts: { intentId: string, txHash: string }
 *
 * Verifies:
 * - Transaction exists on Stellar blockchain
 * - Destination address matches
 * - Amount matches
 * - Asset code matches
 *
 * Updates payment status to 'confirmed' or 'failed'
 */
router.post(
  '/confirm',
  validateRequest({ body: confirmPaymentSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const { intentId, txHash } = req.body;

    // Find the payment intent
    const payment = await PaymentRecordModel.findOne({ intentId });
    if (!payment) {
      return res.status(404).json({
        error: 'NotFound',
        message: `Payment intent '${intentId}' not found`,
      });
    }

    // Check if already confirmed
    if (payment.status === 'confirmed') {
      return res.status(400).json({
        error: 'AlreadyConfirmed',
        message: 'This payment has already been confirmed',
      });
    }

    // Check if already failed
    if (payment.status === 'failed') {
      return res.status(400).json({
        error: 'AlreadyFailed',
        message: 'This payment has already failed',
      });
    }

    // Verify transaction on Stellar blockchain
    const verification = await stellarClient.verifyTransaction(txHash);

    if (!verification.found || !verification.transaction) {
      // Transaction not found on-chain - mark as failed
      await PaymentRecordModel.findByIdAndUpdate(payment._id, {
        status: 'failed',
        txHash,
      });

      return res.status(400).json({
        error: 'TransactionNotFound',
        message: verification.error || 'Transaction not found on Stellar blockchain',
      });
    }

    const tx = verification.transaction;

    // Verify destination matches
    if (tx.to.toLowerCase() !== payment.destination.toLowerCase()) {
      await PaymentRecordModel.findByIdAndUpdate(payment._id, {
        status: 'failed',
        txHash,
      });

      return res.status(400).json({
        error: 'DestinationMismatch',
        message: `Transaction destination ${tx.to} does not match expected ${payment.destination}`,
      });
    }

    // Verify amount matches (compare as strings to avoid floating point issues)
    // Normalize both amounts to the same precision for comparison
    const expectedAmount = parseFloat(payment.amount).toFixed(7);
    const txAmount = parseFloat(tx.amount).toFixed(7);

    if (txAmount !== expectedAmount) {
      await PaymentRecordModel.findByIdAndUpdate(payment._id, {
        status: 'failed',
        txHash,
      });

      return res.status(400).json({
        error: 'AmountMismatch',
        message: `Transaction amount ${tx.amount} does not match expected ${payment.amount}`,
      });
    }

    // Verify asset code matches
    const txAssetCode = tx.asset.split(':')[0].toUpperCase();
    const expectedAssetCode = payment.assetCode.toUpperCase();

    if (txAssetCode !== expectedAssetCode) {
      await PaymentRecordModel.findByIdAndUpdate(payment._id, {
        status: 'failed',
        txHash,
      });

      return res.status(400).json({
        error: 'AssetMismatch',
        message: `Transaction asset ${tx.asset} does not match expected ${payment.assetCode}`,
      });
    }

    // All verifications passed - confirm the payment
    const updatedPayment = await PaymentRecordModel.findByIdAndUpdate(
      payment._id,
      {
        status: 'confirmed',
        txHash,
      },
      { new: true },
    );

    logger.info({
      event: 'payment_confirmed',
      intentId,
      txHash,
      amount: payment.amount,
      assetCode: payment.assetCode,
    });

    res.json({
      status: 'success',
      message: 'Payment confirmed successfully',
      data: toPaymentResponse(updatedPayment!),
    });
  }),
);

router.get(
  '/:id',
  validateRequest({ params: objectIdSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const payment = await PaymentRecordModel.findOne({ _id: req.params.id, clinicId: req.user!.clinicId }).lean();
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const filter: Record<string, any> = { clinicId: req.user!.clinicId };
    if (req.query.patientId) filter.patientId = req.query.patientId;
    const payments = await PaymentRecordModel.find(filter).sort({ createdAt: -1 });
    res.json({ status: 'success', data: payments.map(toPaymentResponse) });
  }),
);

router.get(
  '/:id',
  validateRequest({ params: objectIdSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const payment = await PaymentRecordModel.findById(req.params.id);
    if (!payment) return res.status(404).json({ error: 'NotFound', message: 'Payment not found' });
    res.json({ status: 'success', data: toPaymentResponse(payment) });
  }),
);

export const paymentRoutes = router;
