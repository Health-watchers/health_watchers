import { Router, Request, Response } from 'express';
import { config } from '@health-watchers/config';
import { PaymentRecordModel } from './models/payment-record.model';
import { authenticate } from '@api/middlewares/auth.middleware';
import { validateRequest } from '@api/middlewares/validate.middleware';
import { objectIdSchema } from '@api/middlewares/objectid.schema';
import {
  createPaymentIntentSchema,
  confirmPaymentSchema,
  listPaymentsQuerySchema,
  ListPaymentsQuery,
} from './payments.validation';
import { asyncHandler } from '@api/middlewares/async.handler';
import { toPaymentResponse } from './payments.transformer';
import { AppRole } from '@api/types/express';
import { stellarClient } from './services/stellar-client';
import logger from '@api/utils/logger';

const router = Router();
router.use(authenticate);

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
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Insufficient permissions to view payments',
      });
    }

    const { patientId, status, page, limit } = req.query as unknown as ListPaymentsQuery;

    const filter: Record<string, unknown> = { clinicId: req.user!.clinicId };
    if (patientId) filter.patientId = patientId;
    if (status) filter.status = status;

    const skip = (page - 1) * limit;
    const [payments, total] = await Promise.all([
      PaymentRecordModel.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      PaymentRecordModel.countDocuments(filter),
    ]);

    return res.json({
      status: 'success',
      data: payments.map((p) =>
        toPaymentResponse(p as unknown as Parameters<typeof toPaymentResponse>[0]),
      ),
      meta: { total, page, limit },
    });
  }),
);

// POST /payments/intent
router.post(
  '/intent',
  validateRequest({ body: createPaymentIntentSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const { amount, destination, memo, patientId, assetCode = 'XLM', issuer } = req.body;

    const clinicId = req.user!.clinicId;
    const normalizedAsset = String(assetCode).toUpperCase().trim();

    if (normalizedAsset !== 'XLM' && !config.supportedAssets.includes(normalizedAsset)) {
      return res.status(400).json({
        error: 'UnsupportedAsset',
        message: `Asset '${normalizedAsset}' is not supported. Supported assets: ${config.supportedAssets.join(', ')}`,
      });
    }

    if (normalizedAsset !== 'XLM' && !issuer) {
      return res.status(400).json({
        error: 'BadRequest',
        message: `An issuer address is required for non-native asset '${normalizedAsset}'`,
      });
    }

    const intentId = `intent_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

    const record = await PaymentRecordModel.create({
      intentId,
      amount,
      destination,
      memo,
      clinicId,
      patientId,
      status: 'pending',
      assetCode: normalizedAsset,
      assetIssuer: normalizedAsset === 'XLM' ? null : issuer,
    });

    return res.status(201).json({
      status: 'success',
      data: {
        ...toPaymentResponse(record),
        platformPublicKey: config.stellar.platformPublicKey,
      },
    });
  }),
);

// POST /payments/confirm
router.post(
  '/confirm',
  validateRequest({ body: confirmPaymentSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const { intentId, txHash } = req.body;

    const payment = await PaymentRecordModel.findOne({ intentId });
    if (!payment) {
      return res.status(404).json({
        error: 'NotFound',
        message: `Payment intent '${intentId}' not found`,
      });
    }

    if (payment.status === 'confirmed') {
      return res
        .status(400)
        .json({ error: 'AlreadyConfirmed', message: 'Payment already confirmed' });
    }

    if (payment.status === 'failed') {
      return res.status(400).json({ error: 'AlreadyFailed', message: 'Payment already failed' });
    }

    const verification = await stellarClient.verifyTransaction(txHash);

    if (!verification.found || !verification.transaction) {
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

    const txAssetCode = tx.asset.split(':')[0].toUpperCase();
    if (txAssetCode !== payment.assetCode.toUpperCase()) {
      await PaymentRecordModel.findByIdAndUpdate(payment._id, {
        status: 'failed',
        txHash,
      });
      return res.status(400).json({
        error: 'AssetMismatch',
        message: `Transaction asset ${tx.asset} does not match expected ${payment.assetCode}`,
      });
    }

    const updatedPayment = await PaymentRecordModel.findByIdAndUpdate(
      payment._id,
      { status: 'confirmed', txHash },
      { new: true },
    );

    logger.info({
      event: 'payment_confirmed',
      intentId,
      txHash,
      amount: payment.amount,
      assetCode: payment.assetCode,
    });

    return res.json({
      status: 'success',
      message: 'Payment confirmed successfully',
      data: toPaymentResponse(updatedPayment as unknown as Parameters<typeof toPaymentResponse>[0]),
    });
  }),
);

// GET /payments/:id
router.get(
  '/:id',
  validateRequest({ params: objectIdSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const payment = await PaymentRecordModel.findOne({
      _id: req.params.id,
      clinicId: req.user!.clinicId,
    }).lean();
    if (!payment) return res.status(404).json({ error: 'NotFound', message: 'Payment not found' });
    return res.json({
      status: 'success',
      data: toPaymentResponse(payment as unknown as Parameters<typeof toPaymentResponse>[0]),
    });
  }),
);

export const paymentRoutes = router;
