import { Router, Request, Response } from 'express';
import { config } from '@health-watchers/config';
import { PaymentRecordModel } from './models/payment-record.model';
import { authenticate } from '@api/middlewares/auth.middleware';
import { validateRequest } from '@api/middlewares/validate.middleware';
import {
  createPaymentIntentSchema,
  confirmPaymentSchema,
  confirmPaymentParamsSchema,
  listPaymentsQuerySchema,
  ListPaymentsQuery,
} from './payments.validation';
import { asyncHandler } from '@api/middlewares/async.handler';
import { toPaymentResponse } from './payments.transformer';
import { stellarClient } from './services/stellar-client';
import logger from '@api/utils/logger';
import { randomUUID } from 'crypto';

const router = Router();
router.use(authenticate);

function canReadPayments(role: string): boolean {
  return ['SUPER_ADMIN', 'CLINIC_ADMIN', 'DOCTOR', 'NURSE', 'ASSISTANT', 'READ_ONLY'].includes(role);
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
    if (status) filter.status = status;

    const skip = (page - 1) * limit;
    const [payments, total] = await Promise.all([
      PaymentRecordModel.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      PaymentRecordModel.countDocuments(filter),
    ]);

    return res.json({
      status: 'success',
      data: payments.map(toPaymentResponse),
      meta: { total, page, limit },
    });
  }),
);

// POST /payments/intent
router.post(
  '/intent',
  validateRequest({ body: createPaymentIntentSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const { amount, destination, patientId, assetCode = 'XLM', issuer } = req.body;
    const intentId = randomUUID();
    const clinicId = req.user!.clinicId;
    const normalizedAsset = String(assetCode).toUpperCase().trim();

    // Generate standardized memo: HW:{8-char-intentId}
    const memo = `HW:${intentId.slice(0, 8).toUpperCase()}`;
    
    // Validate memo length (Stellar limit is 28 bytes)
    if (Buffer.byteLength(memo, 'utf8') > 28) {
      return res.status(400).json({
        error: 'MemoTooLong',
        message: `Generated memo exceeds Stellar's 28-byte limit`,
      });
    }

    if (normalizedAsset !== 'XLM' && !config.supportedAssets.includes(normalizedAsset)) {
      return res.status(400).json({
        error: 'UnsupportedAsset',
        message: `Asset '${normalizedAsset}' is not supported. Supported: ${config.supportedAssets.join(', ')}`,
      });
    }

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
      clinicId,
      patientId,
      status: 'pending',
      assetCode: normalizedAsset,
      assetIssuer: normalizedAsset === 'XLM' ? null : issuer,
    });

    logger.info({ intentId, memo, amount, destination }, 'Payment intent created');

    return res.status(201).json({
      status: 'success',
      data: { ...toPaymentResponse(record), platformPublicKey: config.stellar.platformPublicKey },
    });
  }),
);

// PATCH /payments/:intentId/confirm
router.patch(
  '/:intentId/confirm',
  validateRequest({ params: confirmPaymentParamsSchema, body: confirmPaymentSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const { intentId } = req.params;
    const { txHash } = req.body;

    const payment = await PaymentRecordModel.findOne({ intentId, clinicId: req.user!.clinicId });
    if (!payment) {
      return res.status(404).json({ error: 'NotFound', message: `Payment intent '${intentId}' not found` });
    }

    if (payment.status === 'confirmed') {
      return res.status(409).json({ error: 'AlreadyConfirmed', message: 'This payment has already been confirmed' });
    }

    if (payment.status === 'failed') {
      return res.status(400).json({ error: 'AlreadyFailed', message: 'This payment has already failed' });
    }

    // Check for double-confirmation: if txHash is already linked to another confirmed payment
    const existingPayment = await PaymentRecordModel.findOne({ txHash, status: 'confirmed' });
    if (existingPayment && existingPayment.intentId !== intentId) {
      logger.warn({ intentId, txHash, existingIntentId: existingPayment.intentId }, 'Attempted double-confirmation');
      return res.status(409).json({
        error: 'TransactionAlreadyUsed',
        message: `Transaction ${txHash} is already linked to payment intent ${existingPayment.intentId}`,
      });
    }

    const verification = await stellarClient.verifyTransaction(txHash);

    if (!verification.found || !verification.transaction) {
      await PaymentRecordModel.findByIdAndUpdate(payment._id, { status: 'failed', txHash });
      logger.error({ intentId, txHash }, 'Transaction not found on Stellar');
      return res.status(400).json({
        error: 'TransactionNotFound',
        message: verification.error || 'Transaction not found on Stellar blockchain',
      });
    }

    const tx = verification.transaction;

    // Validate memo matches expected format
    if (payment.memo) {
      const txMemo = tx.memo || '';
      if (txMemo !== payment.memo) {
        await PaymentRecordModel.findByIdAndUpdate(payment._id, { status: 'failed', txHash });
        logger.error({ intentId, txHash, expectedMemo: payment.memo, actualMemo: txMemo }, 'Memo mismatch');
        return res.status(400).json({
          error: 'MemoMismatch',
          message: `Transaction memo '${txMemo}' does not match expected '${payment.memo}'`,
        });
      }
    }

    // Validate destination
    if (tx.to.toLowerCase() !== payment.destination.toLowerCase()) {
      await PaymentRecordModel.findByIdAndUpdate(payment._id, { status: 'failed', txHash });
      logger.error({ intentId, txHash, expectedDest: payment.destination, actualDest: tx.to }, 'Destination mismatch');
      return res.status(400).json({
        error: 'DestinationMismatch',
        message: `Transaction destination ${tx.to} does not match expected ${payment.destination}`,
      });
    }

    // Validate amount
    const expectedAmount = parseFloat(payment.amount).toFixed(7);
    const txAmount = parseFloat(tx.amount).toFixed(7);
    if (txAmount !== expectedAmount) {
      await PaymentRecordModel.findByIdAndUpdate(payment._id, { status: 'failed', txHash });
      logger.error({ intentId, txHash, expectedAmount, actualAmount: tx.amount }, 'Amount mismatch');
      return res.status(400).json({
        error: 'AmountMismatch',
        message: `Transaction amount ${tx.amount} does not match expected ${payment.amount}`,
      });
    }

    // Validate asset
    const txAssetCode = tx.asset.split(':')[0].toUpperCase();
    if (txAssetCode !== payment.assetCode.toUpperCase()) {
      await PaymentRecordModel.findByIdAndUpdate(payment._id, { status: 'failed', txHash });
      logger.error({ intentId, txHash, expectedAsset: payment.assetCode, actualAsset: tx.asset }, 'Asset mismatch');
      return res.status(400).json({
        error: 'AssetMismatch',
        message: `Transaction asset ${tx.asset} does not match expected ${payment.assetCode}`,
      });
    }

    // Validate network passphrase (if available from verification)
    if (verification.networkPassphrase && config.stellar.network) {
      const expectedPassphrase = config.stellar.network === 'mainnet' 
        ? 'Public Global Stellar Network ; September 2015'
        : 'Test SDF Network ; September 2015';
      
      if (verification.networkPassphrase !== expectedPassphrase) {
        await PaymentRecordModel.findByIdAndUpdate(payment._id, { status: 'failed', txHash });
        logger.error({ intentId, txHash, expectedNetwork: config.stellar.network, actualPassphrase: verification.networkPassphrase }, 'Network mismatch');
        return res.status(400).json({
          error: 'NetworkMismatch',
          message: `Transaction is on wrong network. Expected ${config.stellar.network}`,
        });
      }
    }

    const updatedPayment = await PaymentRecordModel.findByIdAndUpdate(
      payment._id,
      { status: 'confirmed', txHash, confirmedAt: new Date() },
      { new: true },
    );

    logger.info({ intentId, txHash, memo: payment.memo, amount: payment.amount }, 'Payment confirmed successfully');
    return res.json({ status: 'success', data: toPaymentResponse(updatedPayment!) });
  }),
);

// GET /payments/by-memo/:memo — Look up payment intent by Stellar memo
router.get(
  '/by-memo/:memo',
  asyncHandler(async (req: Request, res: Response) => {
    if (!canReadPayments(req.user!.role)) {
      return res.status(403).json({ error: 'Forbidden', message: 'Insufficient permissions to view payments' });
    }

    const { memo } = req.params;
    
    // Normalize memo to uppercase for case-insensitive lookup
    const normalizedMemo = memo.toUpperCase();

    const payment = await PaymentRecordModel.findOne({ 
      memo: normalizedMemo,
      clinicId: req.user!.clinicId 
    });

    if (!payment) {
      return res.status(404).json({ 
        error: 'NotFound', 
        message: `No payment intent found with memo '${memo}'` 
      });
    }

    logger.info({ memo: normalizedMemo, intentId: payment.intentId }, 'Payment looked up by memo');
    return res.json({ status: 'success', data: toPaymentResponse(payment) });
  }),
);

export const paymentRoutes = router;
