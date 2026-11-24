import { Router, Request, Response } from 'express';
import { config } from '@health-watchers/config';
import { asyncHandler } from '@api/middlewares/async.handler';
import { stellarClient } from './services/stellar-client';
import logger from '@api/utils/logger';

const router = Router();

/**
 * @swagger
 * /payments/fee-estimate:
 *   get:
 *     summary: Get Stellar network fee statistics
 *     tags: [Payments]
 *     security:
 *       - bearerAuth: []
 */
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
 */
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
 */
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
 */
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

export const paymentsBalanceRouter = router;
