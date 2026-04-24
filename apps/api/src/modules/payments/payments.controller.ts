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
import { sendPaymentConfirmationEmail } from '@api/lib/email.service';

const router = Router();
router.use(authenticate);

function canReadPayments(role: string): boolean {
  return ['SUPER_ADMIN', 'CLINIC_ADMIN', 'DOCTOR', 'NURSE', 'ASSISTANT', 'READ_ONLY'].includes(
    role
  );
}

// GET /payments/balance — fetch clinic's Stellar account balance from stellar-service
router.get(
  '/balance',
  asyncHandler(async (req: Request, res: Response) => {
    const clinicId = req.user!.clinicId;
    const { ClinicModel } = await import('../clinics/clinic.model');
    const clinic = await ClinicModel.findById(clinicId).lean();

    if (!clinic?.stellarPublicKey) {
      return res
        .status(404)
        .json({ error: 'NotFound', message: 'No Stellar public key configured for this clinic' });
    }

    try {
      const data = await stellarClient.getBalance(clinic.stellarPublicKey);
      return res.json({
        status: 'success',
        data: {
          publicKey: clinic.stellarPublicKey,
          xlmBalance: data.balance,
          usdcBalance: data.usdcBalance,
          usdcIssuer: config.stellar.usdcIssuer,
          transactions: data.transactions,
        },
      });
    } catch (err: any) {
      return res.status(502).json({ error: 'StellarServiceError', message: err.message });
    }
  })
);

// POST /payments/fund — fund clinic's testnet account via Friendbot
router.post(
  '/fund',
  asyncHandler(async (req: Request, res: Response) => {
    const clinicId = req.user!.clinicId;
    const { ClinicModel } = await import('../clinics/clinic.model');
    const clinic = await ClinicModel.findById(clinicId).lean();

    if (!clinic?.stellarPublicKey) {
      return res
        .status(404)
        .json({ error: 'NotFound', message: 'No Stellar public key configured for this clinic' });
    }

    try {
      const data = await stellarClient.fundAccount(clinic.stellarPublicKey);
      logger.info(
        { clinicId, publicKey: clinic.stellarPublicKey },
        'Testnet account funded via Friendbot'
      );
      return res.json({ status: 'success', data });
    } catch (err: any) {
      return res.status(502).json({ error: 'StellarServiceError', message: err.message });
    }
  })
);

// POST /payments/trustline — create USDC trustline for clinic's Stellar account
router.post(
  '/trustline',
  asyncHandler(async (req: Request, res: Response) => {
    const clinicId = req.user!.clinicId;
    const { ClinicModel } = await import('../clinics/clinic.model');
    const clinic = await ClinicModel.findById(clinicId).lean();

    if (!clinic?.stellarPublicKey) {
      return res
        .status(404)
        .json({ error: 'NotFound', message: 'No Stellar public key configured for this clinic' });
    }

    try {
      const data = await stellarClient.createUsdcTrustline(
        clinic.stellarPublicKey,
        config.stellar.usdcIssuer
      );
      logger.info({ clinicId, publicKey: clinic.stellarPublicKey }, 'USDC trustline created');
      return res.json({ status: 'success', data });
    } catch (err: any) {
      return res.status(502).json({ error: 'StellarServiceError', message: err.message });
    }
  })
);

// GET /payments — paginated list scoped to the authenticated clinic
router.get(
  '/',
  validateRequest({ query: listPaymentsQuerySchema }),
  asyncHandler(async (req: Request, res: Response) => {
    if (!canReadPayments(req.user!.role)) {
      return res
        .status(403)
        .json({ error: 'Forbidden', message: 'Insufficient permissions to view payments' });
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
  })
);

// POST /payments/intent
router.post(
  '/intent',
  validateRequest({ body: createPaymentIntentSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const { amount, destination, memo, patientId, assetCode = 'XLM', issuer, currency } = req.body;
    const intentId = randomUUID();
    const clinicId = req.user!.clinicId;
    // `currency` takes precedence over `assetCode` for convenience
    const normalizedAsset = (currency ?? String(assetCode)).toUpperCase().trim();

    if (normalizedAsset !== 'XLM' && !config.supportedAssets.includes(normalizedAsset)) {
      return res.status(400).json({
        error: 'UnsupportedAsset',
        message: `Asset '${normalizedAsset}' is not supported. Supported: ${config.supportedAssets.join(', ')}`,
      });
    }

    // Auto-resolve USDC issuer from config if not provided
    const resolvedIssuer =
      normalizedAsset === 'USDC' && !issuer ? config.stellar.usdcIssuer : issuer;

    if (normalizedAsset !== 'XLM' && !resolvedIssuer) {
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
      assetIssuer: normalizedAsset === 'XLM' ? null : resolvedIssuer,
    });

    return res.status(201).json({
      status: 'success',
      data: { ...toPaymentResponse(record), platformPublicKey: config.stellar.platformPublicKey },
    });
  })
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
      return res
        .status(404)
        .json({ error: 'NotFound', message: `Payment intent '${intentId}' not found` });
    }

    if (payment.status === 'confirmed') {
      return res
        .status(409)
        .json({ error: 'AlreadyConfirmed', message: 'This payment has already been confirmed' });
    }

    if (payment.status === 'failed') {
      return res
        .status(400)
        .json({ error: 'AlreadyFailed', message: 'This payment has already failed' });
    }

    const verification = await stellarClient.verifyTransaction(txHash);

    if (!verification.found || !verification.transaction) {
      await PaymentRecordModel.findByIdAndUpdate(payment._id, { status: 'failed', txHash });
      return res.status(400).json({
        error: 'TransactionNotFound',
        message: verification.error || 'Transaction not found on Stellar blockchain',
      });
    }

    const tx = verification.transaction;

    if (tx.to.toLowerCase() !== payment.destination.toLowerCase()) {
      await PaymentRecordModel.findByIdAndUpdate(payment._id, { status: 'failed', txHash });
      return res.status(400).json({
        error: 'DestinationMismatch',
        message: `Transaction destination ${tx.to} does not match expected ${payment.destination}`,
      });
    }

    const expectedAmount = parseFloat(payment.amount).toFixed(7);
    const txAmount = parseFloat(tx.amount).toFixed(7);
    if (txAmount !== expectedAmount) {
      await PaymentRecordModel.findByIdAndUpdate(payment._id, { status: 'failed', txHash });
      return res.status(400).json({
        error: 'AmountMismatch',
        message: `Transaction amount ${tx.amount} does not match expected ${payment.amount}`,
      });
    }

    const txAssetCode = tx.asset.split(':')[0].toUpperCase();
    if (txAssetCode !== payment.assetCode.toUpperCase()) {
      await PaymentRecordModel.findByIdAndUpdate(payment._id, { status: 'failed', txHash });
      return res.status(400).json({
        error: 'AssetMismatch',
        message: `Transaction asset ${tx.asset} does not match expected ${payment.assetCode}`,
      });
    }

    const updatedPayment = await PaymentRecordModel.findByIdAndUpdate(
      payment._id,
      { status: 'confirmed', txHash, confirmedAt: new Date() },
      { new: true }
    );

    logger.info({ intentId, txHash }, 'Payment confirmed');

    // Auto-update linked invoice if any (non-blocking)
    try {
      const { InvoiceModel } = await import('../invoices/invoice.model');
      await InvoiceModel.findOneAndUpdate(
        { paymentIntentId: intentId, status: { $ne: 'paid' } },
        { status: 'paid', paidAt: new Date(), paidTxHash: txHash },
      );
    } catch { /* non-critical */ }

    // Send confirmation email to clinic (non-blocking)
    try {
      const { ClinicModel } = await import('../clinics/clinic.model');
      const clinic = await ClinicModel.findById(updatedPayment!.clinicId).lean();
      if (clinic?.email) {
        sendPaymentConfirmationEmail(
          clinic.email,
          updatedPayment!.amount,
          updatedPayment!.assetCode,
          txHash
        );
      }
    } catch {
      /* non-critical */
    }

    return res.json({ status: 'success', data: toPaymentResponse(updatedPayment!) });
  })
);

export const paymentRoutes = router;
