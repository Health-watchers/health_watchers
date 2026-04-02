import { Router, Request, Response } from 'express';
import { PaymentRecordModel } from '../payments/models/payment-record.model';
import { asyncHandler } from '@api/middlewares/async.handler';
import logger from '@api/utils/logger';

const router = Router();

/**
 * POST /webhooks/stellar
 * Receives payment notifications from the stellar-service stream.
 * Matches by memo to a pending PaymentRecord and confirms it.
 */
router.post(
  '/stellar',
  asyncHandler(async (req: Request, res: Response) => {
    const { memo, txHash, amount, from } = req.body as {
      memo?: string;
      txHash?: string;
      amount?: string;
      from?: string;
    };

    if (!memo || !txHash) {
      return res.status(400).json({ error: 'BadRequest', message: 'memo and txHash are required' });
    }

    const payment = await PaymentRecordModel.findOne({ memo, status: 'pending' });

    if (!payment) {
      logger.info({ memo, txHash, from }, 'stellar-webhook: no matching pending payment — ignored');
      return res.json({ status: 'ignored' });
    }

    payment.status = 'confirmed';
    payment.txHash = txHash;
    await payment.save();

    logger.info({ intentId: payment.intentId, txHash, amount }, 'stellar-webhook: payment confirmed');

    return res.json({ status: 'success', data: { intentId: payment.intentId, txHash } });
  }),
);

export const webhookRoutes = router;
