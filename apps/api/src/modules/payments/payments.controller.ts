import { Router, Request, Response } from 'express';
import { config } from '@health-watchers/config';
import { PaymentRecordModel } from './models/payment-record.model';
import { authenticate } from '@api/middlewares/auth.middleware';
import { validateRequest } from '@api/middlewares/validate.middleware';
import { objectIdSchema } from '@api/middlewares/objectid.schema';
import {
  createPaymentIntentSchema,
  confirmPaymentSchema,
  confirmPaymentParamsSchema,
  listPaymentsQuerySchema,
  ListPaymentsQuery,
} from './payments.validation';
import { asyncHandler } from '@api/middlewares/async.handler';
import { toPaymentResponse } from './payments.transformer';
import { AppRole } from '@api/types/express';
import { stellarClient } from './services/stellar-client';
import logger from '@api/utils/logger';

import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';

@Controller('payments')
export class PaymentsController {
  constructor(
    private httpService: HttpService,
    private configService: ConfigService,
  ) {}

  private readonly stellarSecret = this.configService.get('STELLAR_SERVICE_SECRET');
  private readonly stellarUrl = `http://localhost:${this.configService.get('STELLAR_PORT') || 3002}`;

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
    const { intentId, amount, destination, memo, patientId, assetCode = 'XLM', issuer } = req.body;

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
      clinicId,
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
    const expectedAssetCode = payment.assetCode.toUpperCase();
    if (txAssetCode !== expectedAssetCode) {
      await PaymentRecordModel.findByIdAndUpdate(payment._id, { status: 'failed', txHash });
      return res.status(400).json({
        error: 'AssetMismatch',
        message: `Transaction asset ${tx.asset} does not match expected ${payment.assetCode}`,
      });
    }

    const updatedPayment = await PaymentRecordModel.findByIdAndUpdate(
      payment._id,
      {
        headers: {
          'Authorization': `Bearer ${this.stellarSecret}`,
          'Content-Type': 'application/json',
        },
      },
    ).toPromise();
    
    return response.data;
  }

  async createIntent(fromPublicKey: string, toPublicKey: string, amount: number) {
    const response = await this.httpService.post(
      `${this.stellarUrl}/intent`,
      { fromPublicKey, toPublicKey, amount },
      {
        headers: {
          'Authorization': `Bearer ${this.stellarSecret}`,
          'Content-Type': 'application/json',
        },
      },
    ).toPromise();
    
    return response.data;
  }

  // Verify is public - no secret needed
  async verifyIntent(hash: string) {
    const response = await this.httpService.get(`${this.stellarUrl}/verify/${hash}`).toPromise();
    return response.data;
  }
}
