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
  }),
);

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

// POST /payments/intent
router.post(
  '/intent',
  validateRequest({ body: createPaymentIntentSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const { 
      amount, 
      destination, 
      memo, 
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
    } = req.body;
    const intentId = randomUUID();
    const clinicId = req.user!.clinicId;
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
      // Path payment fields
      sourceAssetCode,
      sourceAssetIssuer,
      destinationAmount,
      maxSourceAmount,
      path,
      feeStrategy,
    });

    logger.info({ intentId, memo, amount, destination }, 'Payment intent created');

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
      return res.status(404).json({ error: 'NotFound', message: 'No Stellar public key configured' });
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
        discrepancies.push({ type: 'unrecorded', txHash: tx.hash, amount: tx.amount, date: tx.timestamp });
      }
    }

    // Stale pending records
    const staleCutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
    for (const record of dbRecords) {
      if (record.status === 'pending' && record.txHash && onChainHashes.has(record.txHash)) {
        await PaymentRecordModel.updateOne({ _id: record._id }, { status: 'confirmed' });
        discrepancies.push({ type: 'stale_pending_fixed', intentId: record.intentId });
      } else if (record.status === 'confirmed' && record.txHash && !onChainHashes.has(record.txHash)) {
        discrepancies.push({ type: 'confirmed_not_on_chain', intentId: record.intentId, txHash: record.txHash });
      } else if (record.status === 'pending' && new Date(record.createdAt as any) < staleCutoff) {
        const age = Math.floor((Date.now() - new Date(record.createdAt as any).getTime()) / 86400000);
        discrepancies.push({ type: 'stale_pending', intentId: record.intentId, age: `${age} days` });
      }
    }

    logger.info({ clinicId, discrepancies: discrepancies.length }, 'Payment sync completed');

    return res.json({ status: 'success', data: { synced: true, discrepancies } });
  })
);

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
