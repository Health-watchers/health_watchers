import { Router, Request, Response } from 'express';
import { config } from '@health-watchers/config';
import { PaymentRecordModel } from './models/payment-record.model';
import { PaymentDisputeModel } from './models/payment-dispute.model';
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
import { authorize } from '@api/middlewares/rbac.middleware';
import { toPaymentResponse } from './payments.transformer';
import { stellarClient } from './services/stellar-client';
import logger from '@api/utils/logger';
import { randomUUID } from 'crypto';
import { sendPaymentConfirmationEmail } from '@api/lib/email.service';
import { withSpan } from '@api/utils/tracer';
import { feeBudgetCheck } from '@api/middlewares/fee-budget-check.middleware';
import { emitToClinic } from '@api/realtime/socket';
import { paymentsInitiatedTotal, paymentsConfirmedTotal } from '@api/services/metrics.service';
import { getCurrentXLMRate } from './services/xlm-rate.service';

const router = Router();
router.use(authenticate);

function canReadPayments(role: string): boolean {
  return ['SUPER_ADMIN', 'CLINIC_ADMIN', 'DOCTOR', 'NURSE', 'ASSISTANT', 'READ_ONLY'].includes(
    role
  );
}

/**
 * @swagger
 * /payments/fee-estimate:
 *   get:
 *     summary: Get Stellar network fee statistics
 *     tags: [Payments]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Fee estimate data from Stellar network
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: string, example: success }
 *                 data: { type: object }
 *       502:
 *         description: Stellar service error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
// GET /payments/fee-estimate — fetch Stellar fee statistics
router.get(
  '/fee-estimate',
  asyncHandler(async (_req: Request, res: Response) => {
    try {
      const data = await stellarClient.getFeeEstimate();
      return res.json({ status: 'success', data });
    } catch (err: any) {
      return res.status(502).json({ error: 'StellarServiceError', message: err.message });
    }
  })
);

/**
 * @swagger
 * /payments/balance:
 *   get:
 *     summary: Get clinic's Stellar account balance
 *     tags: [Payments]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Clinic Stellar account balance
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: string, example: success }
 *                 data:
 *                   type: object
 *                   properties:
 *                     publicKey: { type: string }
 *                     federationAddress: { type: string, nullable: true }
 *                     xlmBalance: { type: string }
 *                     usdcBalance: { type: string }
 *       404:
 *         description: No Stellar public key configured
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       502:
 *         description: Stellar service error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
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
      const domain = process.env.FEDERATION_DOMAIN || 'healthwatchers.com';
      return res.json({
        status: 'success',
        data: {
          publicKey: clinic.stellarPublicKey,
          federationAddress: clinic.federationAddress
            ? `${clinic.federationAddress}*${domain}`
            : null,
          xlmBalance: data.balance,
          balance: data.balance,
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

/**
 * @swagger
 * /payments/fund:
 *   post:
 *     summary: Fund clinic's testnet account via Friendbot (testnet only)
 *     tags: [Payments]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Account funded successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: string, example: success }
 *                 data: { type: object }
 *       404:
 *         description: No Stellar public key configured
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       502:
 *         description: Stellar service error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
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

/**
 * @swagger
 * /payments/trustline:
 *   post:
 *     summary: Create USDC trustline for clinic's Stellar account
 *     tags: [Payments]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Trustline created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: string, example: success }
 *                 data: { type: object }
 *       404:
 *         description: No Stellar public key configured
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       502:
 *         description: Stellar service error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
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

/**
 * @swagger
 * /payments:
 *   get:
 *     summary: List payments for the authenticated clinic (paginated)
 *     tags: [Payments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20 }
 *       - in: query
 *         name: patientId
 *         schema: { type: string }
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [pending, confirmed, failed, expired] }
 *     responses:
 *       200:
 *         description: Paginated list of payment records
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: string }
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/PaymentRecord'
 *                 meta:
 *                   type: object
 *                   properties:
 *                     total: { type: integer }
 *                     page: { type: integer }
 *                     limit: { type: integer }
 *       403:
 *         description: Insufficient permissions
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
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

/**
 * @swagger
 * /payments/paths:
 *   get:
 *     summary: Discover Stellar payment paths between assets
 *     tags: [Payments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: sourceAsset
 *         required: true
 *         schema: { type: string, example: XLM }
 *       - in: query
 *         name: destinationAsset
 *         required: true
 *         schema: { type: string, example: USDC }
 *       - in: query
 *         name: amount
 *         required: true
 *         schema: { type: string, example: '10.0000000' }
 *     responses:
 *       200:
 *         description: Available payment paths
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: string }
 *                 data: { type: array, items: { type: object } }
 *       400:
 *         description: Missing required query parameters
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       502:
 *         description: Stellar service error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
// GET /payments/paths — discover payment paths
router.get(
  '/paths',
  asyncHandler(async (req: Request, res: Response) => {
    const { sourceAsset, destinationAsset, amount } = req.query;

    if (!sourceAsset || !destinationAsset || !amount) {
      return res.status(400).json({
        error: 'BadRequest',
        message: 'sourceAsset, destinationAsset, and amount are required',
      });
    }

    try {
      const paths = await stellarClient.findPaths({
        sourceAssetCode: sourceAsset as string,
        destinationAssetCode: destinationAsset as string,
        destinationAmount: amount as string,
        // Assume USDC issuer from config if it's USDC
        sourceAssetIssuer: sourceAsset === 'USDC' ? config.stellar.usdcIssuer : undefined,
        destinationAssetIssuer: destinationAsset === 'USDC' ? config.stellar.usdcIssuer : undefined,
      });

      return res.json({ status: 'success', data: paths });
    } catch (err: any) {
      return res.status(502).json({ error: 'StellarServiceError', message: err.message });
    }
  })
);

/**
 * @swagger
 * /payments/stellar/orderbook:
 *   get:
 *     summary: Get Stellar DEX orderbook for an asset pair
 *     tags: [Payments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: base
 *         required: true
 *         schema: { type: string, example: XLM }
 *       - in: query
 *         name: counter
 *         required: true
 *         schema: { type: string, example: USDC }
 *     responses:
 *       200:
 *         description: Orderbook data
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: string }
 *                 data: { type: object }
 *       400:
 *         description: Missing required query parameters
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       502:
 *         description: Stellar service error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
// GET /payments/stellar/orderbook — get Stellar DEX orderbook
router.get(
  '/stellar/orderbook',
  asyncHandler(async (req: Request, res: Response) => {
    const { base, counter } = req.query;

    if (!base || !counter) {
      return res.status(400).json({
        error: 'BadRequest',
        message: 'base and counter assets are required',
      });
    }

    try {
      const orderbook = await stellarClient.getOrderbook({
        baseAssetCode: base as string,
        counterAssetCode: counter as string,
        baseAssetIssuer: base === 'USDC' ? config.stellar.usdcIssuer : undefined,
        counterAssetIssuer: counter === 'USDC' ? config.stellar.usdcIssuer : undefined,
      });

      return res.json({ status: 'success', data: orderbook });
    } catch (err: any) {
      return res.status(502).json({ error: 'StellarServiceError', message: err.message });
    }
  })
);

/**
 * @swagger
 * /payments/intent:
 *   post:
 *     summary: Create a payment intent
 *     description: Creates a pending payment record and returns the intent ID and memo for the Stellar transaction.
 *     tags: [Payments]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreatePaymentIntentRequest'
 *           example:
 *             amount: "10.0000000"
 *             destination: "GCEZWKCA5VLDNRLN3RPRJMRZOX3Z6G5CHCGZQE3NMQKK6UUUHKKOAIB"
 *             assetCode: "XLM"
 *             patientId: "507f1f77bcf86cd799439011"
 *     responses:
 *       201:
 *         description: Payment intent created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: string, example: success }
 *                 data:
 *                   allOf:
 *                     - $ref: '#/components/schemas/PaymentRecord'
 *                     - type: object
 *                       properties:
 *                         platformPublicKey: { type: string }
 *                         feeBump:
 *                           type: object
 *                           nullable: true
 *                           properties:
 *                             xdr: { type: string }
 *                             hash: { type: string }
 *                             feeStroops: { type: integer }
 *       400:
 *         description: Validation error (unsupported asset, memo too long, missing issuer)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       402:
 *         description: Fee budget exceeded
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
// POST /payments/intent
router.post(
  '/intent',
  validateRequest({ body: createPaymentIntentSchema }),
  feeBudgetCheck,
  asyncHandler(async (req: Request, res: Response) => {
    const {
      amount,
      destination,
      patientId,
      assetCode = 'XLM',
      issuer,
      currency,
      sourceAssetCode,
      sourceAssetIssuer,
      destinationAmount,
      maxSourceAmount,
      path,
      feeStrategy = 'standard',
      sponsorFee = false,
      idempotencyKey,
    } = req.body;
    const intentId = randomUUID();
    const clinicId = req.user!.clinicId;

    if (idempotencyKey) {
      const existing = await PaymentRecordModel.findOne({
        idempotencyKey,
        clinicId,
      }).lean();

      if (existing) {
        return res.json({
          status: 'success',
          data: toPaymentResponse(existing),
          idempotent: true,
        });
      }
    }
    // `currency` takes precedence over `assetCode` for convenience
    const normalizedAsset = (currency ?? String(assetCode)).toUpperCase().trim();

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

    // Auto-resolve USDC issuer from config if not provided
    const resolvedIssuer =
      normalizedAsset === 'USDC' && !issuer ? config.stellar.usdcIssuer : issuer;

    if (normalizedAsset !== 'XLM' && !resolvedIssuer) {
      return res.status(400).json({
        error: 'BadRequest',
        message: `An issuer address is required for non-native asset '${normalizedAsset}'`,
      });
    }

    const record = await withSpan(
      'payment.intent.create',
      {
        'payment.asset': normalizedAsset,
        'payment.amount': amount,
        'clinic.id': String(clinicId),
      },
      async () =>
        PaymentRecordModel.create({
          intentId,
          amount,
          destination,
          memo,
          clinicId,
          patientId,
          status: 'pending',
          assetCode: normalizedAsset,
          assetIssuer: normalizedAsset === 'XLM' ? null : resolvedIssuer,
          // Path payment fields
          sourceAssetCode,
          sourceAssetIssuer,
          destinationAmount,
          maxSourceAmount,
          path,
          feeStrategy,
          idempotencyKey: idempotencyKey ?? undefined,
        })
    );

    logger.info({ intentId, memo, amount, destination }, 'Payment intent created');
    paymentsInitiatedTotal.inc({ currency: normalizedAsset });
    cache.del(dashboardCacheKey(String(clinicId)));

    let feeBump: { xdr: string; hash: string; feeStroops: number } | undefined;
    if (sponsorFee) {
      try {
        const { checkFeeBudget, recordSponsoredFee } =
          await import('./services/fee-budget.service');
        const BASE_FEE_STROOPS = 100;
        const feeStroops = BASE_FEE_STROOPS * 10;
        const allowed = await checkFeeBudget(String(clinicId), feeStroops);
        if (allowed) {
          feeBump = await stellarClient.sponsorFeeBump(record.intentId);
          await recordSponsoredFee(String(clinicId), record.intentId, feeStroops);
        } else {
          logger.warn({ clinicId }, 'Fee sponsorship skipped: budget exceeded');
        }
      } catch (err: any) {
        logger.warn({ err }, 'Fee bump failed, returning unsigned intent');
      }
    }

    return res.status(201).json({
      status: 'success',
      data: {
        ...toPaymentResponse(record),
        platformPublicKey: config.stellar.platformPublicKey,
        ...(feeBump ? { feeBump } : {}),
      },
    });
  })
);

/**
 * @swagger
 * /payments/{intentId}/confirm:
 *   patch:
 *     summary: Confirm a payment intent with a Stellar transaction hash
 *     description: Verifies the transaction on Stellar and marks the payment as confirmed. Validates memo, destination, amount, and asset.
 *     tags: [Payments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: intentId
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ConfirmPaymentRequest'
 *     responses:
 *       200:
 *         description: Payment confirmed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: string }
 *                 data:
 *                   $ref: '#/components/schemas/PaymentRecord'
 *       400:
 *         description: Transaction not found, memo/destination/amount/asset mismatch
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: Payment intent not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       409:
 *         description: Payment already confirmed or transaction already used
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
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

    // Check for double-confirmation: if txHash is already linked to another confirmed payment
    const existingPayment = await PaymentRecordModel.findOne({ txHash, status: 'confirmed' });
    if (existingPayment && existingPayment.intentId !== intentId) {
      logger.warn(
        { intentId, txHash, existingIntentId: existingPayment.intentId },
        'Attempted double-confirmation'
      );
      return res.status(409).json({
        error: 'TransactionAlreadyUsed',
        message: `Transaction ${txHash} is already linked to payment intent ${existingPayment.intentId}`,
      });
    }

    const verification = await withSpan(
      'stellar.transaction.verify',
      { 'stellar.tx_hash': txHash },
      async () => stellarClient.verifyTransaction(txHash)
    );

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
        logger.error(
          { intentId, txHash, expectedMemo: payment.memo, actualMemo: txMemo },
          'Memo mismatch'
        );
        return res.status(400).json({
          error: 'MemoMismatch',
          message: `Transaction memo '${txMemo}' does not match expected '${payment.memo}'`,
        });
      }
    }

    // Validate destination
    if (tx.to.toLowerCase() !== payment.destination.toLowerCase()) {
      await PaymentRecordModel.findByIdAndUpdate(payment._id, { status: 'failed', txHash });
      logger.error(
        { intentId, txHash, expectedDest: payment.destination, actualDest: tx.to },
        'Destination mismatch'
      );
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
      logger.error(
        { intentId, txHash, expectedAmount, actualAmount: tx.amount },
        'Amount mismatch'
      );
      return res.status(400).json({
        error: 'AmountMismatch',
        message: `Transaction amount ${tx.amount} does not match expected ${payment.amount}`,
      });
    }

    // Validate asset
    const txAssetCode = tx.asset.split(':')[0].toUpperCase();
    if (txAssetCode !== payment.assetCode.toUpperCase()) {
      await PaymentRecordModel.findByIdAndUpdate(payment._id, { status: 'failed', txHash });
      logger.error(
        { intentId, txHash, expectedAsset: payment.assetCode, actualAsset: tx.asset },
        'Asset mismatch'
      );
      return res.status(400).json({
        error: 'AssetMismatch',
        message: `Transaction asset ${tx.asset} does not match expected ${payment.assetCode}`,
      });
    }

    // Validate network passphrase (if available from verification)
    if (verification.networkPassphrase && config.stellar.network) {
      const expectedPassphrase =
        config.stellar.network === 'mainnet'
          ? 'Public Global Stellar Network ; September 2015'
          : 'Test SDF Network ; September 2015';

      if (verification.networkPassphrase !== expectedPassphrase) {
        await PaymentRecordModel.findByIdAndUpdate(payment._id, { status: 'failed', txHash });
        logger.error(
          {
            intentId,
            txHash,
            expectedNetwork: config.stellar.network,
            actualPassphrase: verification.networkPassphrase,
          },
          'Network mismatch'
        );
        return res.status(400).json({
          error: 'NetworkMismatch',
          message: `Transaction is on wrong network. Expected ${config.stellar.network}`,
        });
      }
    }

    // Capture the exchange rate at the time of payment so receipts show an
    // accurate USD equivalent even if the rate changes later. USDC is pegged ~1:1.
    let exchangeRate = payment.exchangeRate;
    if (!exchangeRate) {
      if (payment.assetCode === 'USDC') {
        exchangeRate = '1';
      } else {
        const current = await getCurrentXLMRate();
        exchangeRate = current.rateUSD.toString();
      }
    }
    const usdEquivalent = (parseFloat(payment.amount) * parseFloat(exchangeRate)).toFixed(2);

    const updatedPayment = await PaymentRecordModel.findByIdAndUpdate(
      payment._id,
      { status: 'confirmed', txHash, confirmedAt: new Date(), exchangeRate, usdEquivalent },
      { new: true }
    );

    logger.info({ intentId, txHash }, 'Payment confirmed');
    paymentsConfirmedTotal.inc({ currency: updatedPayment?.assetCode ?? 'XLM' });

    // Auto-update linked invoice if any (non-blocking)
    try {
      const { InvoiceModel } = await import('../invoices/invoice.model');
      await InvoiceModel.findOneAndUpdate(
        { paymentIntentId: intentId, status: { $ne: 'paid' } },
        { status: 'paid', paidAt: new Date(), paidTxHash: txHash }
      );
    } catch {
      /* non-critical */
    }

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

    emitToClinic(String(updatedPayment!.clinicId), 'payment:confirmed', {
      paymentId: String(updatedPayment!._id),
      txHash,
      amount: updatedPayment!.amount,
      assetCode: updatedPayment!.assetCode,
    });
    return res.json({ status: 'success', data: toPaymentResponse(updatedPayment!) });
  })
);

/**
 * @swagger
 * /payments/sync:
 *   post:
 *     summary: Reconcile DB payments with Stellar Horizon (CLINIC_ADMIN only)
 *     tags: [Payments]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Sync completed with discrepancy report
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: string }
 *                 data:
 *                   type: object
 *                   properties:
 *                     synced: { type: boolean }
 *                     discrepancies: { type: array, items: { type: object } }
 *       403:
 *         description: CLINIC_ADMIN role required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       502:
 *         description: Stellar service error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
// POST /payments/sync — reconcile DB with Horizon (CLINIC_ADMIN only)
router.post(
  '/sync',
  asyncHandler(async (req: Request, res: Response) => {
    if (!['CLINIC_ADMIN', 'SUPER_ADMIN'].includes(req.user!.role)) {
      return res.status(403).json({ error: 'Forbidden', message: 'CLINIC_ADMIN role required' });
    }

    const clinicId = req.user!.clinicId;
    const { ClinicModel } = await import('../clinics/clinic.model');
    const clinic = await ClinicModel.findById(clinicId).lean();

    if (!clinic?.stellarPublicKey) {
      return res
        .status(404)
        .json({ error: 'NotFound', message: 'No Stellar public key configured' });
    }

    // Fetch recent transactions from Horizon via stellar-service
    let onChainTxs: any[] = [];
    try {
      const balanceData = await stellarClient.getBalance(clinic.stellarPublicKey);
      onChainTxs = (balanceData.transactions as any[]) || [];
    } catch (err: any) {
      return res.status(502).json({ error: 'StellarServiceError', message: err.message });
    }

    const dbRecords = await PaymentRecordModel.find({ clinicId }).lean();
    const dbByHash = new Map(dbRecords.filter((r) => r.txHash).map((r) => [r.txHash!, r]));
    const onChainHashes = new Set(onChainTxs.map((t: any) => t.hash));

    const discrepancies: any[] = [];

    // Unrecorded on-chain transactions
    for (const tx of onChainTxs) {
      if (!dbByHash.has(tx.hash)) {
        discrepancies.push({
          type: 'unrecorded',
          txHash: tx.hash,
          amount: tx.amount,
          date: tx.timestamp,
        });
      }
    }

    // Stale pending records
    const staleCutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
    for (const record of dbRecords) {
      if (record.status === 'pending' && record.txHash && onChainHashes.has(record.txHash)) {
        await PaymentRecordModel.updateOne({ _id: record._id }, { status: 'confirmed' });
        discrepancies.push({ type: 'stale_pending_fixed', intentId: record.intentId });
      } else if (
        record.status === 'confirmed' &&
        record.txHash &&
        !onChainHashes.has(record.txHash)
      ) {
        discrepancies.push({
          type: 'confirmed_not_on_chain',
          intentId: record.intentId,
          txHash: record.txHash,
        });
      } else if (record.status === 'pending' && new Date(record.createdAt as any) < staleCutoff) {
        const age = Math.floor(
          (Date.now() - new Date(record.createdAt as any).getTime()) / 86400000
        );
        discrepancies.push({
          type: 'stale_pending',
          intentId: record.intentId,
          age: `${age} days`,
        });
      }
    }

    logger.info({ clinicId, discrepancies: discrepancies.length }, 'Payment sync completed');

    return res.json({ status: 'success', data: { synced: true, discrepancies } });
  })
);

/**
 * @swagger
 * /payments/reconciliation:
 *   get:
 *     summary: Get monthly reconciliation report (CLINIC_ADMIN only)
 *     tags: [Payments]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Reconciliation report for current month
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: string }
 *                 data:
 *                   type: object
 *                   properties:
 *                     period: { type: string, example: '2026-05' }
 *                     totalInDB: { type: integer }
 *                     confirmed: { type: integer }
 *                     pending: { type: integer }
 *                     failed: { type: integer }
 *                     discrepancies: { type: array, items: { type: object } }
 *       403:
 *         description: CLINIC_ADMIN role required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
// GET /payments/reconciliation — reconciliation report
router.get(
  '/reconciliation',
  asyncHandler(async (req: Request, res: Response) => {
    if (!['CLINIC_ADMIN', 'SUPER_ADMIN'].includes(req.user!.role)) {
      return res.status(403).json({ error: 'Forbidden', message: 'CLINIC_ADMIN role required' });
    }

    const clinicId = req.user!.clinicId;
    const now = new Date();
    const period = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const dbRecords = await PaymentRecordModel.find({
      clinicId,
      createdAt: { $gte: startOfMonth },
    }).lean();

    const staleCutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const discrepancies = dbRecords
      .filter((r) => r.status === 'pending' && new Date(r.createdAt as any) < staleCutoff)
      .map((r) => ({
        type: 'stale_pending',
        intentId: r.intentId,
        age: `${Math.floor((Date.now() - new Date(r.createdAt as any).getTime()) / 86400000)} days`,
      }));

    return res.json({
      status: 'success',
      data: {
        period,
        totalInDB: dbRecords.length,
        confirmed: dbRecords.filter((r) => r.status === 'confirmed').length,
        pending: dbRecords.filter((r) => r.status === 'pending').length,
        failed: dbRecords.filter((r) => r.status === 'failed').length,
        discrepancies,
      },
    });
  })
);

/**
 * @swagger
 * /payments/by-memo/{memo}:
 *   get:
 *     summary: Look up a payment intent by Stellar memo
 *     tags: [Payments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: memo
 *         required: true
 *         schema: { type: string, example: 'HW:A1B2C3D4' }
 *     responses:
 *       200:
 *         description: Payment record
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: string }
 *                 data:
 *                   $ref: '#/components/schemas/PaymentRecord'
 *       404:
 *         description: No payment found with that memo
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
// GET /payments/by-memo/:memo — Look up payment intent by Stellar memo
router.get(
  '/by-memo/:memo',
  asyncHandler(async (req: Request, res: Response) => {
    if (!canReadPayments(req.user!.role)) {
      return res
        .status(403)
        .json({ error: 'Forbidden', message: 'Insufficient permissions to view payments' });
    }

    const { memo } = req.params;

    // Normalize memo to uppercase for case-insensitive lookup
    const normalizedMemo = memo.toUpperCase();

    const payment = await PaymentRecordModel.findOne({
      memo: normalizedMemo,
      clinicId: req.user!.clinicId,
    });

    if (!payment) {
      return res.status(404).json({
        error: 'NotFound',
        message: `No payment intent found with memo '${memo}'`,
      });
    }

    logger.info({ memo: normalizedMemo, intentId: payment.intentId }, 'Payment looked up by memo');
    return res.json({ status: 'success', data: toPaymentResponse(payment) });
  })
);

/**
 * @swagger
 * /payments/balance-snapshots:
 *   get:
 *     summary: Get daily balance history for the clinic (up to 90 days)
 *     tags: [Payments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 30, maximum: 90 }
 *     responses:
 *       200:
 *         description: Array of daily balance snapshots
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: string }
 *                 data: { type: array, items: { type: object } }
 */
// GET /payments/balance-snapshots — fetch daily balance history for the clinic
router.get(
  '/balance-snapshots',
  asyncHandler(async (req: Request, res: Response) => {
    if (!canReadPayments(req.user!.role)) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const clinicId = req.user!.clinicId;
    const limit = Math.min(parseInt((req.query.limit as string) ?? '30', 10), 90);
    const { BalanceSnapshotModel } = await import('./models/balance-snapshot.model');
    const snapshots = await BalanceSnapshotModel.find({ clinicId })
      .sort({ date: -1 })
      .limit(limit)
      .lean();
    return res.json({ status: 'success', data: snapshots.reverse() });
  })
);

/**
 * @swagger
 * /payments/analytics:
 *   get:
 *     summary: Get payment analytics for a date range
 *     tags: [Payments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: from
 *         required: true
 *         schema: { type: string, format: date, example: '2026-01-01' }
 *       - in: query
 *         name: to
 *         required: true
 *         schema: { type: string, format: date, example: '2026-05-31' }
 *       - in: query
 *         name: groupBy
 *         schema: { type: string, enum: [day, week, month], default: month }
 *     responses:
 *       200:
 *         description: Payment analytics data
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: string }
 *                 data: { type: object }
 *       400:
 *         description: Missing or invalid date parameters
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
// GET /payments/analytics — fetch payment analytics
router.get(
  '/analytics',
  asyncHandler(async (req: Request, res: Response) => {
    if (!canReadPayments(req.user!.role)) {
      return res.status(403).json({ error: 'Forbidden', message: 'Insufficient permissions' });
    }

    const clinicId = req.user!.clinicId;
    const { from, to, groupBy } = req.query;

    if (!from || !to) {
      return res.status(400).json({
        error: 'BadRequest',
        message: 'from and to query parameters are required (ISO 8601 format)',
      });
    }

    const fromDate = new Date(from as string);
    const toDate = new Date(to as string);
    const groupByPeriod = (groupBy as 'day' | 'week' | 'month') || 'month';

    if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) {
      return res.status(400).json({
        error: 'BadRequest',
        message: 'Invalid date format. Use ISO 8601 format (e.g., 2026-01-01)',
      });
    }

    const { getPaymentAnalytics } = await import('./services/analytics.service');
    const analytics = await getPaymentAnalytics(clinicId, fromDate, toDate, groupByPeriod);

    return res.json({ status: 'success', data: analytics });
  })
);

/**
 * @swagger
 * /payments/revenue-dashboard:
 *   get:
 *     summary: Get revenue dashboard data
 *     tags: [Payments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: months
 *         schema: { type: integer, default: 12, maximum: 36 }
 *     responses:
 *       200:
 *         description: Revenue dashboard data
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: string }
 *                 data: { type: object }
 */
// GET /payments/revenue-dashboard — fetch revenue dashboard data
router.get(
  '/revenue-dashboard',
  asyncHandler(async (req: Request, res: Response) => {
    if (!canReadPayments(req.user!.role)) {
      return res.status(403).json({ error: 'Forbidden', message: 'Insufficient permissions' });
    }

    const clinicId = req.user!.clinicId;
    const months = Math.min(parseInt((req.query.months as string) ?? '12', 10), 36);

    const { getRevenueDashboard } = await import('./services/analytics.service');
    const dashboard = await getRevenueDashboard(clinicId, months);

    return res.json({ status: 'success', data: dashboard });
  })
);

/**
 * @swagger
 * /payments/{intentId}/qr:
 *   get:
 *     summary: Generate QR code for a payment intent
 *     tags: [Payments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: intentId
 *         required: true
 *         schema: { type: string, format: uuid }
 *       - in: query
 *         name: format
 *         schema: { type: string, enum: [png, svg, data-url], default: png }
 *     responses:
 *       200:
 *         description: QR code image (PNG/SVG) or data URL JSON
 *       404:
 *         description: Payment intent not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
// GET /payments/:intentId/qr — Generate QR code for payment intent
router.get(
  '/:intentId/qr',
  asyncHandler(async (req: Request, res: Response) => {
    const { intentId } = req.params;
    const { format = 'png' } = req.query;

    const payment = await PaymentRecordModel.findOne({
      intentId,
      clinicId: req.user!.clinicId,
    });

    if (!payment) {
      return res.status(404).json({
        error: 'NotFound',
        message: 'Payment intent not found',
      });
    }

    try {
      const { QRCodeService } = await import('./services/qr-code.service');
      const paymentURI = QRCodeService.generateStellarPaymentURI(
        payment.destination,
        payment.amount,
        payment.assetCode,
        payment.memo
      );

      if (format === 'svg') {
        const svg = await QRCodeService.generateQRCodeSVG(paymentURI);
        res.setHeader('Content-Type', 'image/svg+xml');
        return res.send(svg);
      } else if (format === 'data-url') {
        const dataUrl = await QRCodeService.generateQRCodeDataURL(paymentURI);
        return res.json({ status: 'success', data: { qrCode: dataUrl, paymentURI } });
      } else {
        const buffer = await QRCodeService.generateQRCodePNG(paymentURI);
        res.setHeader('Content-Type', 'image/png');
        res.setHeader('Content-Length', buffer.length);
        return res.send(buffer);
      }
    } catch (err: any) {
      logger.error({ intentId, error: err.message }, 'Failed to generate QR code');
      return res.status(500).json({
        error: 'InternalServerError',
        message: 'Failed to generate QR code',
      });
    }
  })
);

/**
 * @swagger
 * /payments/{intentId}/payment-uri:
 *   get:
 *     summary: Get Stellar payment URI (SEP-0007) for a payment intent
 *     tags: [Payments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: intentId
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Stellar payment URI
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: string }
 *                 data:
 *                   type: object
 *                   properties:
 *                     paymentURI: { type: string }
 *                     destination: { type: string }
 *                     amount: { type: string }
 *                     assetCode: { type: string }
 *                     memo: { type: string }
 *       404:
 *         description: Payment intent not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
// GET /payments/:intentId/payment-uri — Get Stellar payment URI
router.get(
  '/:intentId/payment-uri',
  asyncHandler(async (req: Request, res: Response) => {
    const { intentId } = req.params;

    const payment = await PaymentRecordModel.findOne({
      intentId,
      clinicId: req.user!.clinicId,
    });

    if (!payment) {
      return res.status(404).json({
        error: 'NotFound',
        message: 'Payment intent not found',
      });
    }

    try {
      const { QRCodeService } = await import('./services/qr-code.service');
      const paymentURI = QRCodeService.generateStellarPaymentURI(
        payment.destination,
        payment.amount,
        payment.assetCode,
        payment.memo
      );

      return res.json({
        status: 'success',
        data: {
          paymentURI,
          destination: payment.destination,
          amount: payment.amount,
          assetCode: payment.assetCode,
          memo: payment.memo,
        },
      });
    } catch (err: any) {
      logger.error({ intentId, error: err.message }, 'Failed to generate payment URI');
      return res.status(500).json({
        error: 'InternalServerError',
        message: 'Failed to generate payment URI',
      });
    }
  })
);

/**
 * @swagger
 * /payments/{intentId}/receipt:
 *   get:
 *     summary: Get receipt info for a confirmed payment
 *     tags: [Payments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: intentId
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Receipt data
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: string }
 *                 data:
 *                   type: object
 *                   properties:
 *                     receiptUrl: { type: string }
 *                     receiptNumber: { type: string }
 *                     generatedAt: { type: string, format: date-time }
 *       404:
 *         description: Payment or receipt not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
// GET /payments/:intentId/receipt — Download receipt PDF
router.get(
  '/:intentId/receipt',
  asyncHandler(async (req: Request, res: Response) => {
    const { intentId } = req.params;

    const payment = await PaymentRecordModel.findOne({
      intentId,
      clinicId: req.user!.clinicId,
    });

    if (!payment) {
      return res.status(404).json({
        error: 'NotFound',
        message: 'Payment intent not found',
      });
    }

    if (!payment.receiptUrl) {
      return res.status(404).json({
        error: 'NotFound',
        message: 'Receipt not yet generated for this payment',
      });
    }

    try {
      // Surface dispute status on the receipt so patients/clinics see it at a glance.
      const dispute = await PaymentDisputeModel.findOne({ paymentIntentId: intentId })
        .select('status resolution refundIntentId')
        .lean();

      // Return pre-signed S3 URL or receipt data
      return res.json({
        status: 'success',
        data: {
          receiptUrl: payment.receiptUrl,
          receiptNumber: payment.receiptNumber,
          generatedAt: payment.receiptGeneratedAt,
          disputeStatus: dispute ? (dispute as any).status : 'none',
          refundIntentId: dispute ? (dispute as any).refundIntentId : undefined,
        },
      });
    } catch (err: any) {
      logger.error({ intentId, error: err.message }, 'Failed to retrieve receipt');
      return res.status(500).json({
        error: 'InternalServerError',
        message: 'Failed to retrieve receipt',
      });
    }
  })
);

/**
 * @swagger
 * /payments/{intentId}/receipt/url:
 *   get:
 *     summary: Get pre-signed S3 URL for a payment receipt
 *     tags: [Payments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: intentId
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Pre-signed receipt URL (expires in 1 hour)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: string }
 *                 data:
 *                   type: object
 *                   properties:
 *                     receiptUrl: { type: string }
 *                     receiptNumber: { type: string }
 *                     expiresIn: { type: integer, example: 3600 }
 *       404:
 *         description: Payment or receipt not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
// GET /payments/:intentId/receipt/url — Get pre-signed S3 URL
router.get(
  '/:intentId/receipt/url',
  asyncHandler(async (req: Request, res: Response) => {
    const { intentId } = req.params;

    const payment = await PaymentRecordModel.findOne({
      intentId,
      clinicId: req.user!.clinicId,
    });

    if (!payment) {
      return res.status(404).json({
        error: 'NotFound',
        message: 'Payment intent not found',
      });
    }

    if (!payment.receiptUrl) {
      return res.status(404).json({
        error: 'NotFound',
        message: 'Receipt not yet generated for this payment',
      });
    }

    return res.json({
      status: 'success',
      data: {
        receiptUrl: payment.receiptUrl,
        receiptNumber: payment.receiptNumber,
        expiresIn: 3600, // 1 hour
      },
    });
  })
);

// ── Fraud Detection endpoints ─────────────────────────────────────────────────

// GET /api/v1/payments/fraud-review
router.get(
  '/fraud-review',
  authenticate,
  requireRoles('CLINIC_ADMIN'),
  asyncHandler(async (req: Request, res: Response) => {
    const { fraudDetectionService } = await import('./services/fraud-detection.service');
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const offset = parseInt(req.query.offset as string) || 0;

    const alerts = await fraudDetectionService.getFraudReviewQueue(
      req.user!.clinicId.toString(),
      limit,
      offset
    );
    return res.json({ status: 'success', data: alerts });
  })
);

// POST /api/v1/payments/fraud-review/:alertId/approve
router.post(
  '/fraud-review/:alertId/approve',
  authenticate,
  requireRoles('CLINIC_ADMIN'),
  asyncHandler(async (req: Request, res: Response) => {
    const { fraudDetectionService } = await import('./services/fraud-detection.service');
    const { notes } = req.body;

    const alert = await fraudDetectionService.approveFraudAlert(
      req.params.alertId,
      req.user!.userId,
      notes
    );
    return res.json({ status: 'success', data: alert });
  })
);

// POST /api/v1/payments/fraud-review/:alertId/reject
router.post(
  '/fraud-review/:alertId/reject',
  authenticate,
  requireRoles('CLINIC_ADMIN'),
  asyncHandler(async (req: Request, res: Response) => {
    const { fraudDetectionService } = await import('./services/fraud-detection.service');
    const { notes } = req.body;

    const alert = await fraudDetectionService.rejectFraudAlert(
      req.params.alertId,
      req.user!.userId,
      notes
    );
    return res.json({ status: 'success', data: alert });
  })
);

// ── Compliance Reporting endpoints ────────────────────────────────────────────

// GET /api/v1/compliance/report
router.get(
  '/compliance/report',
  authenticate,
  requireRoles('CLINIC_ADMIN'),
  asyncHandler(async (req: Request, res: Response) => {
    const { period, jurisdiction } = req.query;
    if (!period || !jurisdiction) {
      return res
        .status(400)
        .json({ error: 'BadRequest', message: 'period and jurisdiction required' });
    }

    const { complianceReportingService } = await import('./services/compliance-reporting.service');
    const report = await complianceReportingService.getReport(
      req.user!.clinicId.toString(),
      period as string,
      jurisdiction as string
    );
    if (!report) return res.status(404).json({ error: 'NotFound', message: 'Report not found' });
    return res.json({ status: 'success', data: report });
  })
);

// POST /api/v1/compliance/report/generate
router.post(
  '/compliance/report/generate',
  authenticate,
  requireRoles('CLINIC_ADMIN'),
  asyncHandler(async (req: Request, res: Response) => {
    const { period, jurisdiction } = req.body;
    if (!period || !jurisdiction) {
      return res
        .status(400)
        .json({ error: 'BadRequest', message: 'period and jurisdiction required' });
    }

    const { complianceReportingService } = await import('./services/compliance-reporting.service');
    const report = await complianceReportingService.generateComplianceReport(
      req.user!.clinicId.toString(),
      period,
      jurisdiction
    );
    return res.json({ status: 'success', data: report });
  })
);

// POST /api/v1/compliance/report/:reportId/submit
router.post(
  '/compliance/report/:reportId/submit',
  authenticate,
  requireRoles('CLINIC_ADMIN'),
  asyncHandler(async (req: Request, res: Response) => {
    const { complianceReportingService } = await import('./services/compliance-reporting.service');
    const report = await complianceReportingService.submitReport(
      req.params.reportId,
      req.user!.userId
    );
    return res.json({ status: 'success', data: report });
  })
);

// GET /api/v1/compliance/reports
router.get(
  '/compliance/reports',
  authenticate,
  requireRoles('CLINIC_ADMIN'),
  asyncHandler(async (req: Request, res: Response) => {
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const offset = parseInt(req.query.offset as string) || 0;

    const { complianceReportingService } = await import('./services/compliance-reporting.service');
    const { reports, total } = await complianceReportingService.listReports(
      req.user!.clinicId.toString(),
      limit,
      offset
    );
    return res.json({ status: 'success', data: reports, pagination: { limit, offset, total } });
  })
);

// ── Multi-Signature Payment Endpoints ──────────────────────────────────────────

// POST /payments/multisig — create a multi-signature payment request
router.post(
  '/multisig',
  validateRequest({ body: createPaymentIntentSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const { amount, currency, description, requiredSignatures, signers } = req.body;
    const clinicId = req.user!.clinicId;

    if (!requiredSignatures || !signers || signers.length < 2) {
      return res.status(400).json({
        error: 'ValidationError',
        message: 'requiredSignatures and at least 2 signers are required',
      });
    }

    try {
      const { multiSigPaymentService } = await import('./services/multisig-payment.service');
      const { payment, multiSigPayment } = await multiSigPaymentService.createMultiSigPaymentRequest({
        paymentId: undefined as any,
        clinicId,
        amount,
        currency,
        requiredSignatures,
        signers,
        description,
      });

      paymentsInitiatedTotal.inc({ currency });

      return res.status(201).json({
        status: 'success',
        data: {
          payment,
          multiSigPayment,
          signatureProgress: {
            collected: 0,
            required: requiredSignatures,
            complete: false,
          },
        },
      });
    } catch (err: any) {
      return res.status(400).json({ error: 'PaymentError', message: err.message });
    }
  })
);

// POST /payments/multisig/:paymentId/sign — add a signature to a multi-sig payment
router.post(
  '/multisig/:paymentId/sign',
  validateRequest({ body: { type: 'object', properties: { signer: { type: 'string' }, signature: { type: 'string' } }, required: ['signer', 'signature'] } as any }),
  asyncHandler(async (req: Request, res: Response) => {
    const { paymentId } = req.params;
    const { signer, signature } = req.body;

    try {
      const { multiSigPaymentService } = await import('./services/multisig-payment.service');
      const multiSigPayment = await multiSigPaymentService.addSignature(paymentId, signer, signature);

      return res.json({
        status: 'success',
        data: {
          multiSigPayment,
          signatureProgress: {
            collected: multiSigPayment.signatures.length,
            required: multiSigPayment.requiredSignatures,
            complete: multiSigPayment.signatures.length >= multiSigPayment.requiredSignatures,
          },
        },
      });
    } catch (err: any) {
      return res.status(400).json({ error: 'SignatureError', message: err.message });
    }
  })
);

// GET /payments/multisig/:paymentId — get multi-sig payment details
router.get(
  '/multisig/:paymentId',
  asyncHandler(async (req: Request, res: Response) => {
    const { paymentId } = req.params;

    try {
      const { multiSigPaymentService } = await import('./services/multisig-payment.service');
      const multiSigPayment = await multiSigPaymentService.getMultiSigPayment(paymentId);

      return res.json({ status: 'success', data: multiSigPayment });
    } catch (err: any) {
      return res.status(404).json({ error: 'NotFound', message: err.message });
    }
  })
);

// GET /payments/multisig/pending/:signer — list pending multi-sig payments for a signer
router.get(
  '/multisig/pending/:signer',
  asyncHandler(async (req: Request, res: Response) => {
    const { signer } = req.params;

    try {
      const { multiSigPaymentService } = await import('./services/multisig-payment.service');
      const payments = await multiSigPaymentService.getPendingPaymentsForSigner(signer);

      return res.json({ status: 'success', data: payments });
    } catch (err: any) {
      return res.status(400).json({ error: 'Error', message: err.message });
    }
  })
);

/**
 * @swagger
 * /payments/expiring-claimable:
 *   get:
 *     summary: List claimable balances expiring within 24 hours (CLINIC_ADMIN)
 *     description: >
 *       Returns all unclaimed claimable-balance payment records whose `claimableUntil`
 *       falls within the next 24 hours. Useful for clinic admins to monitor patients
 *       who have not yet claimed their payment before the window closes.
 *       The hourly expiry-notification job also uses this window to send proactive
 *       email, in-app, and Socket.IO notifications to patients (issue #714).
 *     tags: [Payments]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of expiring claimable balances for the clinic
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: string, example: success }
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       intentId: { type: string }
 *                       claimableBalanceId: { type: string }
 *                       amount: { type: string }
 *                       patientId: { type: string }
 *                       claimableUntil: { type: string, format: date-time }
 *                       claimableExpiryNotificationSent: { type: boolean }
 *       403:
 *         description: Forbidden — CLINIC_ADMIN or SUPER_ADMIN only
 */
// GET /payments/expiring-claimable — list claimable balances expiring within 24h (CLINIC_ADMIN)
router.get(
  '/expiring-claimable',
  authorize(['CLINIC_ADMIN', 'SUPER_ADMIN']),
  asyncHandler(async (req: Request, res: Response) => {
    const { clinicId } = req.user!;
    const now = new Date();
    const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    const records = await PaymentRecordModel.find({
      clinicId,
      claimableUntil: { $gte: now, $lte: in24h },
      claimed: { $ne: true },
    })
      .select('intentId claimableBalanceId amount patientId claimableUntil claimableExpiryNotificationSent')
      .lean();

    return res.json({ status: 'success', data: records });
  })
);

export const paymentRoutes = router;
