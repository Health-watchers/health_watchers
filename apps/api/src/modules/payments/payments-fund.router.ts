import { Router, Request, Response } from 'express';
import { config } from '@health-watchers/config';
import { asyncHandler } from '@api/middlewares/async.handler';
import { stellarClient } from './services/stellar-client';

const router = Router();

/**
 * @swagger
 * /payments/paths:
 *   get:
 *     summary: Discover Stellar payment paths between assets
 *     tags: [Payments]
 *     security:
 *       - bearerAuth: []
 */
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
 */
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

export const paymentsFundRouter = router;
