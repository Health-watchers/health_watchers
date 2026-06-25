import { Router, Request, Response } from 'express';
import { authenticate } from '@api/middlewares/auth.middleware';
import { asyncHandler } from '@api/middlewares/async.handler';
import { getCurrentXLMRate } from './services/xlm-rate.service';

const router = Router();
router.use(authenticate);

/**
 * @swagger
 * /payments/exchange-rate:
 *   get:
 *     summary: Get the current XLM/USD exchange rate
 *     description: >
 *       Returns the most recent cached XLM→USD rate (refreshed every 5 minutes),
 *       along with its source, age and a staleness flag. The rate is sourced from
 *       the Redis cache, falling back to the latest stored historical sample.
 *     tags: [Payments]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Current exchange rate
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: string, example: success }
 *                 data:
 *                   type: object
 *                   properties:
 *                     pair: { type: string, example: XLM/USD }
 *                     rateUSD: { type: number, example: 0.1123 }
 *                     source: { type: string, example: coingecko }
 *                     fetchedAt: { type: string, format: date-time }
 *                     ageMs: { type: integer, example: 42000 }
 *                     stale: { type: boolean, example: false }
 */
// GET /payments/exchange-rate — current XLM/USD rate with staleness info
router.get(
  '/exchange-rate',
  asyncHandler(async (_req: Request, res: Response) => {
    const rate = await getCurrentXLMRate();
    return res.json({
      status: 'success',
      data: {
        pair: 'XLM/USD',
        rateUSD: rate.rateUSD,
        source: rate.source,
        fetchedAt: rate.fetchedAt,
        ageMs: rate.ageMs,
        stale: rate.stale,
      },
    });
  })
);

export const exchangeRateRoutes = router;
